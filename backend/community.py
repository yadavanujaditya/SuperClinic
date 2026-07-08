import uuid
from datetime import datetime, timezone
from typing import Optional, List

from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel

from database import db
from auth import get_current_user

router = APIRouter(prefix="/api/community", tags=["community"])


class TemplatePublish(BaseModel):
    name: str
    diagnosis: str
    category: str = "General"
    slots: List[dict] = []
    sampleBody: str = ""


class WorkflowPublish(BaseModel):
    name: str
    category: str = "General"
    tags: List[str] = []
    workflow: dict = {}


class RateContent(BaseModel):
    stars: int


def _serialize(doc: dict) -> dict:
    doc = dict(doc)
    doc.pop("_id", None)
    avg = doc["rating_sum"] / doc["rating_count"] if doc.get("rating_count") else 0
    doc["avg_rating"] = round(avg, 1)
    return doc


async def _rate(collection: str, content_id: str, stars: int, user_id: str):
    if not (1 <= stars <= 5):
        raise HTTPException(status_code=400, detail="Stars must be between 1 and 5")
    doc = await db[collection].find_one({"id": content_id})
    if not doc:
        raise HTTPException(status_code=404, detail="Not found")
    existing = await db.content_ratings.find_one({"user_id": user_id, "content_type": collection, "content_id": content_id})
    if existing:
        diff = stars - existing["stars"]
        await db[collection].update_one({"id": content_id}, {"$inc": {"rating_sum": diff}})
        await db.content_ratings.update_one({"_id": existing["_id"]}, {"$set": {"stars": stars}})
    else:
        await db[collection].update_one({"id": content_id}, {"$inc": {"rating_sum": stars, "rating_count": 1}})
        await db.content_ratings.insert_one({"user_id": user_id, "content_type": collection, "content_id": content_id, "stars": stars, "created_at": datetime.now(timezone.utc)})
    updated = await db[collection].find_one({"id": content_id})
    return _serialize(updated)


# ── Templates ────────────────────────────────────────────────────────────────
@router.post("/templates/publish")
async def publish_template(payload: TemplatePublish, user=Depends(get_current_user)):
    existing = await db.shared_templates.find_one({"owner_user_id": user["user_id"], "name": payload.name})
    if existing:
        await db.shared_templates.update_one({"_id": existing["_id"]}, {"$set": {
            "diagnosis": payload.diagnosis, "category": payload.category, "slots": payload.slots, "sampleBody": payload.sampleBody,
        }})
        doc = await db.shared_templates.find_one({"_id": existing["_id"]})
        return _serialize(doc)
    doc = {
        "id": f"stpl_{uuid.uuid4().hex[:12]}",
        "owner_user_id": user["user_id"], "owner_name": user["name"],
        "name": payload.name, "diagnosis": payload.diagnosis, "category": payload.category,
        "slots": payload.slots, "sampleBody": payload.sampleBody,
        "rating_sum": 0, "rating_count": 0, "created_at": datetime.now(timezone.utc),
    }
    await db.shared_templates.insert_one(doc)
    return _serialize(doc)


@router.get("/templates")
async def list_templates(user=Depends(get_current_user)):
    docs = await db.shared_templates.find({}, {"_id": 0}).sort("rating_sum", -1).to_list(500)
    return [_serialize(d) for d in docs]


@router.delete("/templates/{content_id}")
async def unpublish_template(content_id: str, user=Depends(get_current_user)):
    res = await db.shared_templates.delete_one({"id": content_id, "owner_user_id": user["user_id"]})
    if res.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Not found or not owner")
    return {"success": True}


@router.post("/templates/{content_id}/rate")
async def rate_template(content_id: str, payload: RateContent, user=Depends(get_current_user)):
    return await _rate("shared_templates", content_id, payload.stars, user["user_id"])


# ── Workflows (custom clinical consultation flows) ──────────────────────────
@router.post("/workflows/publish")
async def publish_workflow(payload: WorkflowPublish, user=Depends(get_current_user)):
    existing = await db.shared_workflows.find_one({"owner_user_id": user["user_id"], "name": payload.name})
    if existing:
        await db.shared_workflows.update_one({"_id": existing["_id"]}, {"$set": {
            "category": payload.category, "tags": payload.tags, "workflow": payload.workflow,
        }})
        doc = await db.shared_workflows.find_one({"_id": existing["_id"]})
        return _serialize(doc)
    doc = {
        "id": f"swf_{uuid.uuid4().hex[:12]}",
        "owner_user_id": user["user_id"], "owner_name": user["name"],
        "name": payload.name, "category": payload.category, "tags": payload.tags, "workflow": payload.workflow,
        "rating_sum": 0, "rating_count": 0, "created_at": datetime.now(timezone.utc),
    }
    await db.shared_workflows.insert_one(doc)
    return _serialize(doc)


@router.get("/workflows")
async def list_workflows(user=Depends(get_current_user)):
    docs = await db.shared_workflows.find({}, {"_id": 0}).sort("rating_sum", -1).to_list(500)
    return [_serialize(d) for d in docs]


@router.delete("/workflows/{content_id}")
async def unpublish_workflow(content_id: str, user=Depends(get_current_user)):
    res = await db.shared_workflows.delete_one({"id": content_id, "owner_user_id": user["user_id"]})
    if res.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Not found or not owner")
    return {"success": True}


@router.post("/workflows/{content_id}/rate")
async def rate_workflow(content_id: str, payload: RateContent, user=Depends(get_current_user)):
    return await _rate("shared_workflows", content_id, payload.stars, user["user_id"])
