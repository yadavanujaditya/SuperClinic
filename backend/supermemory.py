import uuid
from datetime import datetime, timezone
from typing import Optional, List

from fastapi import APIRouter, HTTPException, Depends, UploadFile, File, Form
from fastapi.responses import Response
from pydantic import BaseModel

from database import db
from auth import get_current_user
from storage import put_object, get_object

router = APIRouter(prefix="/api/supermemory", tags=["supermemory"])


def _serialize(doc: dict) -> dict:
    doc = dict(doc)
    doc.pop("_id", None)
    return doc


# ── Books (PDF binaries in object storage, metadata in Mongo) ───────────────
@router.post("/books")
async def upload_book(
    file: UploadFile = File(...),
    num_pages: int = Form(0),
    user=Depends(get_current_user),
):
    data = await file.read()
    ext = file.filename.split(".")[-1] if "." in file.filename else "pdf"
    storage_path = f"superclinic/books/{user['user_id']}/{uuid.uuid4()}.{ext}"
    result = put_object(storage_path, data, file.content_type or "application/pdf")

    doc = {
        "id": "book_" + uuid.uuid4().hex[:12],
        "user_id": user["user_id"],
        "name": file.filename,
        "num_pages": num_pages,
        "size": result.get("size", len(data)),
        "storage_path": result["path"],
        "is_deleted": False,
        "created_at": datetime.now(timezone.utc),
    }
    await db.pdf_books.insert_one(doc)
    return _serialize(doc)


@router.get("/books")
async def list_books(user=Depends(get_current_user)):
    docs = await db.pdf_books.find(
        {"user_id": user["user_id"], "is_deleted": False}, {"_id": 0}
    ).sort("created_at", -1).to_list(500)
    return docs


@router.get("/books/{book_id}/download")
async def download_book(book_id: str, user=Depends(get_current_user)):
    doc = await db.pdf_books.find_one({"id": book_id, "user_id": user["user_id"], "is_deleted": False})
    if not doc:
        raise HTTPException(status_code=404, detail="Book not found")
    data, content_type = get_object(doc["storage_path"])
    return Response(content=data, media_type=content_type or "application/pdf")


@router.delete("/books/{book_id}")
async def delete_book(book_id: str, user=Depends(get_current_user)):
    res = await db.pdf_books.update_one(
        {"id": book_id, "user_id": user["user_id"]}, {"$set": {"is_deleted": True}}
    )
    if res.matched_count == 0:
        raise HTTPException(status_code=404, detail="Book not found")
    # Clean up tag sources pointing at this book, drop tags left with no sources
    await db.pdf_tags.update_many(
        {"user_id": user["user_id"]},
        {"$pull": {"sources": {"doc_id": book_id}}},
    )
    await db.pdf_tags.delete_many({"user_id": user["user_id"], "sources": {"$size": 0}})
    return {"success": True}


# ── Tags (client generates the id/label, backend mirrors it) ────────────────
class TagSource(BaseModel):
    doc_id: str
    doc_name: str
    page: int
    extracted_text: Optional[str] = None
    image: Optional[str] = None


class TagUpsert(BaseModel):
    id: str
    label: str
    source: TagSource


@router.get("/tags")
async def list_tags(user=Depends(get_current_user)):
    docs = await db.pdf_tags.find({"user_id": user["user_id"]}, {"_id": 0}).to_list(1000)
    return docs


@router.post("/tags")
async def upsert_tag(payload: TagUpsert, user=Depends(get_current_user)):
    existing = await db.pdf_tags.find_one({"id": payload.id, "user_id": user["user_id"]})
    src = payload.source.model_dump()
    if existing:
        already = any(s["doc_id"] == src["doc_id"] and s["page"] == src["page"] for s in existing["sources"])
        if not already:
            await db.pdf_tags.update_one(
                {"id": payload.id, "user_id": user["user_id"]},
                {"$push": {"sources": src}, "$set": {"label": payload.label}},
            )
    else:
        await db.pdf_tags.insert_one({
            "id": payload.id,
            "user_id": user["user_id"],
            "label": payload.label,
            "sources": [src],
            "created_at": datetime.now(timezone.utc),
        })
    doc = await db.pdf_tags.find_one({"id": payload.id, "user_id": user["user_id"]}, {"_id": 0})
    return doc


class SourceRemove(BaseModel):
    doc_id: str
    page: int


@router.delete("/tags/{tag_id}/source")
async def remove_tag_source(tag_id: str, payload: SourceRemove, user=Depends(get_current_user)):
    await db.pdf_tags.update_one(
        {"id": tag_id, "user_id": user["user_id"]},
        {"$pull": {"sources": {"doc_id": payload.doc_id, "page": payload.page}}},
    )
    await db.pdf_tags.delete_many({"id": tag_id, "user_id": user["user_id"], "sources": {"$size": 0}})
    return {"success": True}


@router.delete("/tags/{tag_id}")
async def delete_tag(tag_id: str, user=Depends(get_current_user)):
    await db.pdf_tags.delete_one({"id": tag_id, "user_id": user["user_id"]})
    return {"success": True}
