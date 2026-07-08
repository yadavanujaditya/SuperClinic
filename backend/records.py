import uuid
from datetime import datetime, timezone
from typing import Optional, List

from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel

from database import db
from auth import get_current_user, get_current_admin

router = APIRouter(prefix="/api/records", tags=["records"])


class SummaryCreate(BaseModel):
    diagnosis: str
    template_name: Optional[str] = None
    source: str = "fill"  # fill | ai_wizard | ai_mode
    text: str


class CaseCreate(BaseModel):
    complaint: str
    age: Optional[str] = None
    sex: Optional[str] = None
    history: List[dict] = []
    differentials: List[dict] = []
    red_flags: List[str] = []
    note_text: str


class RatingCreate(BaseModel):
    record_type: str  # summary | case
    record_id: str
    stars: int
    comment: Optional[str] = None


def _serialize(doc: dict) -> dict:
    doc = dict(doc)
    doc.pop("_id", None)
    return doc


# ── Discharge summaries ──────────────────────────────────────────────────────
@router.post("/summaries")
async def save_summary(payload: SummaryCreate, user=Depends(get_current_user)):
    doc = {
        "id": f"sum_{uuid.uuid4().hex[:12]}",
        "user_id": user["user_id"],
        "user_name": user["name"],
        "diagnosis": payload.diagnosis,
        "template_name": payload.template_name,
        "source": payload.source,
        "text": payload.text,
        "created_at": datetime.now(timezone.utc),
    }
    await db.summaries.insert_one(doc)
    return _serialize(doc)


@router.get("/summaries/mine")
async def my_summaries(user=Depends(get_current_user)):
    docs = await db.summaries.find({"user_id": user["user_id"]}, {"_id": 0}).sort("created_at", -1).to_list(500)
    return docs


@router.delete("/summaries/{record_id}")
async def delete_summary(record_id: str, user=Depends(get_current_user)):
    res = await db.summaries.delete_one({"id": record_id, "user_id": user["user_id"]})
    if res.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Summary not found")
    return {"success": True}


# ── Clinical case sheets ─────────────────────────────────────────────────────
@router.post("/cases")
async def save_case(payload: CaseCreate, user=Depends(get_current_user)):
    doc = {
        "id": f"case_{uuid.uuid4().hex[:12]}",
        "user_id": user["user_id"],
        "user_name": user["name"],
        "complaint": payload.complaint,
        "age": payload.age,
        "sex": payload.sex,
        "history": payload.history,
        "differentials": payload.differentials,
        "red_flags": payload.red_flags,
        "note_text": payload.note_text,
        "created_at": datetime.now(timezone.utc),
    }
    await db.cases.insert_one(doc)
    return _serialize(doc)


@router.get("/cases/mine")
async def my_cases(user=Depends(get_current_user)):
    docs = await db.cases.find({"user_id": user["user_id"]}, {"_id": 0}).sort("created_at", -1).to_list(500)
    return docs


@router.delete("/cases/{record_id}")
async def delete_case(record_id: str, user=Depends(get_current_user)):
    res = await db.cases.delete_one({"id": record_id, "user_id": user["user_id"]})
    if res.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Case not found")
    return {"success": True}


# ── Ratings (post-completion feedback) ──────────────────────────────────────
@router.post("/ratings")
async def submit_rating(payload: RatingCreate, user=Depends(get_current_user)):
    if payload.record_type not in ("summary", "case"):
        raise HTTPException(status_code=400, detail="Invalid record_type")
    if not (1 <= payload.stars <= 5):
        raise HTTPException(status_code=400, detail="Stars must be between 1 and 5")
    doc = {
        "id": f"rate_{uuid.uuid4().hex[:12]}",
        "user_id": user["user_id"],
        "record_type": payload.record_type,
        "record_id": payload.record_id,
        "stars": payload.stars,
        "comment": payload.comment,
        "created_at": datetime.now(timezone.utc),
    }
    await db.app_ratings.insert_one(doc)
    return _serialize(doc)


# ── Admin: view all users' records ──────────────────────────────────────────
@router.get("/admin/summaries")
async def admin_all_summaries(admin=Depends(get_current_admin)):
    docs = await db.summaries.find({}, {"_id": 0}).sort("created_at", -1).to_list(1000)
    return docs


@router.get("/admin/cases")
async def admin_all_cases(admin=Depends(get_current_admin)):
    docs = await db.cases.find({}, {"_id": 0}).sort("created_at", -1).to_list(1000)
    return docs


@router.get("/admin/ratings")
async def admin_all_ratings(admin=Depends(get_current_admin)):
    docs = await db.app_ratings.find({}, {"_id": 0}).sort("created_at", -1).to_list(1000)
    return docs


@router.get("/admin/users")
async def admin_all_users(admin=Depends(get_current_admin)):
    docs = await db.users.find({}, {"_id": 0, "password_hash": 0}).sort("created_at", -1).to_list(1000)
    return docs
