import os
import uuid
import secrets
from datetime import datetime, timezone, timedelta
from typing import Optional

import bcrypt
import httpx
from fastapi import APIRouter, HTTPException, Request, Response, Depends
from pydantic import BaseModel, EmailStr, ConfigDict

from database import db

router = APIRouter(prefix="/api/auth", tags=["auth"])

ADMIN_EMAIL = os.environ.get("ADMIN_EMAIL", "").lower()
SESSION_EXPIRY_DAYS = 7
PROFESSIONS = {"mbbs_student", "resident", "consultant"}


class RegisterRequest(BaseModel):
    email: EmailStr
    password: str
    name: str


class LoginRequest(BaseModel):
    email: EmailStr
    password: str


class GoogleSessionRequest(BaseModel):
    session_id: str


class ProfileUpdateRequest(BaseModel):
    profession: Optional[str] = None
    mobile_number: Optional[str] = None


class UserPublic(BaseModel):
    model_config = ConfigDict(extra="ignore")
    user_id: str
    email: str
    name: str
    picture: Optional[str] = None
    profession: Optional[str] = None
    mobile_number: Optional[str] = None
    role: str
    auth_provider: str
    has_api_key: bool = False


def _hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode(), bcrypt.gensalt()).decode()


def _verify_password(password: str, password_hash: str) -> bool:
    try:
        return bcrypt.checkpw(password.encode(), password_hash.encode())
    except ValueError:
        return False


def _to_public(user_doc: dict) -> UserPublic:
    return UserPublic(
        user_id=user_doc["user_id"],
        email=user_doc["email"],
        name=user_doc["name"],
        picture=user_doc.get("picture"),
        profession=user_doc.get("profession"),
        mobile_number=user_doc.get("mobile_number"),
        role=user_doc.get("role", "user"),
        auth_provider=user_doc.get("auth_provider", "email"),
        has_api_key=bool(user_doc.get("ai_api_key")),
    )


async def _create_session(user_id: str, token: Optional[str] = None) -> str:
    session_token = token or secrets.token_urlsafe(32)
    expires_at = datetime.now(timezone.utc) + timedelta(days=SESSION_EXPIRY_DAYS)
    await db.sessions.insert_one({
        "user_id": user_id,
        "session_token": session_token,
        "expires_at": expires_at,
        "created_at": datetime.now(timezone.utc),
    })
    return session_token


def _set_session_cookie(response: Response, session_token: str):
    response.set_cookie(
        key="session_token",
        value=session_token,
        httponly=True,
        secure=True,
        samesite="none",
        path="/",
        max_age=SESSION_EXPIRY_DAYS * 24 * 60 * 60,
    )


async def get_current_user(request: Request) -> dict:
    token = request.cookies.get("session_token")
    if not token:
        auth_header = request.headers.get("authorization", "")
        if auth_header.startswith("Bearer "):
            token = auth_header[7:]
    if not token:
        raise HTTPException(status_code=401, detail="Not authenticated")

    session_doc = await db.sessions.find_one({"session_token": token}, {"_id": 0})
    if not session_doc:
        raise HTTPException(status_code=401, detail="Session not found")

    expires_at = session_doc["expires_at"]
    if isinstance(expires_at, str):
        expires_at = datetime.fromisoformat(expires_at)
    if expires_at.tzinfo is None:
        expires_at = expires_at.replace(tzinfo=timezone.utc)
    if expires_at < datetime.now(timezone.utc):
        raise HTTPException(status_code=401, detail="Session expired")

    user_doc = await db.users.find_one({"user_id": session_doc["user_id"]}, {"_id": 0})
    if not user_doc:
        raise HTTPException(status_code=401, detail="User not found")
    return user_doc


async def get_current_admin(user_doc: dict = Depends(get_current_user)) -> dict:
    if user_doc.get("role") != "admin":
        raise HTTPException(status_code=403, detail="Admin access required")
    return user_doc


@router.post("/register", response_model=UserPublic)
async def register(payload: RegisterRequest, response: Response):
    email = payload.email.lower()
    existing = await db.users.find_one({"email": email}, {"_id": 0})
    if existing:
        raise HTTPException(status_code=400, detail="Email already registered")

    user_id = f"user_{uuid.uuid4().hex[:12]}"
    role = "admin" if email == ADMIN_EMAIL else "user"
    user_doc = {
        "user_id": user_id,
        "email": email,
        "name": payload.name.strip(),
        "picture": None,
        "password_hash": _hash_password(payload.password),
        "profession": None,
        "mobile_number": None,
        "role": role,
        "auth_provider": "email",
        "created_at": datetime.now(timezone.utc),
    }
    await db.users.insert_one(user_doc)
    session_token = await _create_session(user_id)
    _set_session_cookie(response, session_token)
    return _to_public(user_doc)


@router.post("/login", response_model=UserPublic)
async def login(payload: LoginRequest, response: Response):
    user_doc = await db.users.find_one({"email": payload.email.lower()}, {"_id": 0})
    if not user_doc or not user_doc.get("password_hash"):
        raise HTTPException(status_code=401, detail="Invalid email or password")
    if not _verify_password(payload.password, user_doc["password_hash"]):
        raise HTTPException(status_code=401, detail="Invalid email or password")

    session_token = await _create_session(user_doc["user_id"])
    _set_session_cookie(response, session_token)
    return _to_public(user_doc)


@router.post("/google/session", response_model=UserPublic)
async def google_session(payload: GoogleSessionRequest, response: Response):
    async with httpx.AsyncClient(timeout=10.0) as http_client:
        r = await http_client.get(
            "https://demobackend.emergentagent.com/auth/v1/env/oauth/session-data",
            headers={"X-Session-ID": payload.session_id},
        )
    if r.status_code != 200:
        raise HTTPException(status_code=401, detail="Invalid Google session")
    data = r.json()
    email = data["email"].lower()

    user_doc = await db.users.find_one({"email": email}, {"_id": 0})
    if user_doc:
        update_fields = {"picture": data.get("picture"), "name": data.get("name") or user_doc["name"]}
        await db.users.update_one({"user_id": user_doc["user_id"]}, {"$set": update_fields})
        user_doc.update(update_fields)
    else:
        user_id = f"user_{uuid.uuid4().hex[:12]}"
        role = "admin" if email == ADMIN_EMAIL else "user"
        user_doc = {
            "user_id": user_id,
            "email": email,
            "name": data.get("name") or email.split("@")[0],
            "picture": data.get("picture"),
            "password_hash": None,
            "profession": None,
            "mobile_number": None,
            "role": role,
            "auth_provider": "google",
            "created_at": datetime.now(timezone.utc),
        }
        await db.users.insert_one(user_doc)

    session_token = data["session_token"]
    expires_at = datetime.now(timezone.utc) + timedelta(days=SESSION_EXPIRY_DAYS)
    await db.sessions.insert_one({
        "user_id": user_doc["user_id"],
        "session_token": session_token,
        "expires_at": expires_at,
        "created_at": datetime.now(timezone.utc),
    })
    _set_session_cookie(response, session_token)
    return _to_public(user_doc)


@router.get("/me", response_model=UserPublic)
async def me(user_doc: dict = Depends(get_current_user)):
    return _to_public(user_doc)


@router.post("/logout")
async def logout(request: Request, response: Response):
    token = request.cookies.get("session_token")
    if token:
        await db.sessions.delete_one({"session_token": token})
    response.delete_cookie("session_token", path="/")
    return {"success": True}


@router.put("/profile", response_model=UserPublic)
async def update_profile(payload: ProfileUpdateRequest, user_doc: dict = Depends(get_current_user)):
    update_fields = {}
    if payload.profession is not None:
        if payload.profession not in PROFESSIONS:
            raise HTTPException(status_code=400, detail="Invalid profession")
        update_fields["profession"] = payload.profession
    if payload.mobile_number is not None:
        update_fields["mobile_number"] = payload.mobile_number.strip()
    if update_fields:
        await db.users.update_one({"user_id": user_doc["user_id"]}, {"$set": update_fields})
        user_doc.update(update_fields)
    return _to_public(user_doc)
