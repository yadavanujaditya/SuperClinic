import json
from datetime import datetime, timezone
from typing import Optional, AsyncGenerator

import httpx
from fastapi import APIRouter, HTTPException, Depends
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

from database import db
from auth import get_current_user, get_current_admin

router = APIRouter(prefix="/api", tags=["ai"])

PROVIDER_META = {
    "claude": {"model": "claude-sonnet-4-6", "key_prefix": "sk-ant-"},
    "gemini": {"model": "gemini-2.5-pro", "key_prefix": "AIza"},
    "deepseek": {"model": "deepseek-chat", "key_prefix": "sk-"},
    "openai": {"model": "gpt-4o", "key_prefix": "sk-"},
}


class AIConfigUpdate(BaseModel):
    provider: str
    api_key: str


class ChatStreamRequest(BaseModel):
    messages: list
    system: Optional[str] = None


class VisionRequest(BaseModel):
    image_base64: str
    media_type: str
    prompt: str


def _mask(key: str) -> str:
    if not key or len(key) < 8:
        return "••••••••"
    return f"{key[:6]}••••{key[-4:]}"


async def _get_ai_config() -> Optional[dict]:
    return await db.admin_settings.find_one({"_id": "ai_config"}, {"_id": 0})


# ── Admin: configure AI key ─────────────────────────────────────────────────
@router.get("/admin/ai-config")
async def get_ai_config(admin=Depends(get_current_admin)):
    cfg = await _get_ai_config()
    if not cfg:
        return {"configured": False, "provider": None, "masked_key": None}
    return {"configured": True, "provider": cfg["provider"], "masked_key": _mask(cfg["api_key"])}


@router.put("/admin/ai-config")
async def set_ai_config(payload: AIConfigUpdate, admin=Depends(get_current_admin)):
    if payload.provider not in PROVIDER_META:
        raise HTTPException(status_code=400, detail="Unknown provider")
    if not payload.api_key.strip():
        raise HTTPException(status_code=400, detail="API key cannot be empty")
    await db.admin_settings.update_one(
        {"_id": "ai_config"},
        {"$set": {"provider": payload.provider, "api_key": payload.api_key.strip(), "updated_at": datetime.now(timezone.utc)}},
        upsert=True,
    )
    return {"configured": True, "provider": payload.provider, "masked_key": _mask(payload.api_key.strip())}


@router.delete("/admin/ai-config")
async def clear_ai_config(admin=Depends(get_current_admin)):
    await db.admin_settings.delete_one({"_id": "ai_config"})
    return {"configured": False}


# ── Any authenticated user: check status (no key exposed) ──────────────────
@router.get("/ai/status")
async def ai_status(user=Depends(get_current_user)):
    cfg = await _get_ai_config()
    if not cfg:
        return {"configured": False, "provider": None}
    return {"configured": True, "provider": cfg["provider"]}


# ── Streaming chat proxy — uses admin-configured key server-side ───────────
async def _stream_claude(messages, system, api_key, model) -> AsyncGenerator[bytes, None]:
    try:
        async with httpx.AsyncClient(timeout=60.0) as client:
            async with client.stream(
                "POST", "https://api.anthropic.com/v1/messages",
                headers={"Content-Type": "application/json", "anthropic-version": "2023-06-01", "x-api-key": api_key},
                json={"model": model, "max_tokens": 4096, "stream": True, "system": system, "messages": messages},
            ) as res:
                if res.status_code != 200:
                    body = await res.aread()
                    yield f"__AI_STREAM_ERROR__:Claude API {res.status_code}: {body.decode(errors='ignore')[:300]}".encode()
                    return
                async for line in res.aiter_lines():
                    if not line.startswith("data: "):
                        continue
                    data = line[6:].strip()
                    if not data:
                        continue
                    try:
                        ev = json.loads(data)
                        if ev.get("type") == "content_block_delta" and ev.get("delta", {}).get("type") == "text_delta":
                            yield ev["delta"]["text"].encode()
                    except (json.JSONDecodeError, KeyError):
                        continue
    except httpx.HTTPError as e:
        yield f"__AI_STREAM_ERROR__:Claude network error: {e}".encode()


async def _stream_gemini(messages, system, api_key, model) -> AsyncGenerator[bytes, None]:
    contents = [{"role": "model" if m.get("role") == "assistant" else "user", "parts": [{"text": m.get("content", "")}]} for m in messages]
    thinking_budget = 128 if "pro" in model else 0
    body = {
        "contents": contents,
        "generationConfig": {"maxOutputTokens": 4096, "thinkingConfig": {"thinkingBudget": thinking_budget}},
    }
    if system:
        body["systemInstruction"] = {"parts": [{"text": system}]}
    url = f"https://generativelanguage.googleapis.com/v1beta/models/{model}:streamGenerateContent?alt=sse&key={api_key}"
    try:
        async with httpx.AsyncClient(timeout=60.0) as client:
            async with client.stream("POST", url, headers={"Content-Type": "application/json"}, json=body) as res:
                if res.status_code != 200:
                    text = await res.aread()
                    yield f"__AI_STREAM_ERROR__:Gemini API {res.status_code}: {text.decode(errors='ignore')[:300]}".encode()
                    return
                async for line in res.aiter_lines():
                    if not line.startswith("data: "):
                        continue
                    data = line[6:].strip()
                    if not data or data == "[DONE]":
                        continue
                    try:
                        ev = json.loads(data)
                        parts = ev.get("candidates", [{}])[0].get("content", {}).get("parts", [])
                        for part in parts:
                            if not part.get("thought") and part.get("text"):
                                yield part["text"].encode()
                    except (json.JSONDecodeError, KeyError, IndexError):
                        continue
    except httpx.HTTPError as e:
        yield f"__AI_STREAM_ERROR__:Gemini network error: {e}".encode()


async def _stream_openai_compat(messages, system, api_key, model, base_url) -> AsyncGenerator[bytes, None]:
    full_messages = ([{"role": "system", "content": system}] if system else []) + messages
    try:
        async with httpx.AsyncClient(timeout=60.0) as client:
            async with client.stream(
                "POST", f"{base_url}/chat/completions",
                headers={"Content-Type": "application/json", "Authorization": f"Bearer {api_key}"},
                json={"model": model, "max_tokens": 4096, "stream": True, "messages": full_messages},
            ) as res:
                if res.status_code != 200:
                    text = await res.aread()
                    yield f"__AI_STREAM_ERROR__:API {res.status_code}: {text.decode(errors='ignore')[:300]}".encode()
                    return
                async for line in res.aiter_lines():
                    if not line.startswith("data: "):
                        continue
                    data = line[6:].strip()
                    if not data or data == "[DONE]":
                        continue
                    try:
                        ev = json.loads(data)
                        text = ev.get("choices", [{}])[0].get("delta", {}).get("content")
                        if text:
                            yield text.encode()
                    except (json.JSONDecodeError, KeyError, IndexError):
                        continue
    except httpx.HTTPError as e:
        yield f"__AI_STREAM_ERROR__:API network error: {e}".encode()


@router.post("/ai/chat/stream")
async def chat_stream(payload: ChatStreamRequest, user=Depends(get_current_user)):
    cfg = await _get_ai_config()
    if not cfg:
        raise HTTPException(status_code=400, detail="AI is not configured yet — ask your admin to add an API key.")
    provider = cfg["provider"]
    api_key = cfg["api_key"]
    model = PROVIDER_META[provider]["model"]

    if provider == "claude":
        gen = _stream_claude(payload.messages, payload.system, api_key, model)
    elif provider == "gemini":
        gen = _stream_gemini(payload.messages, payload.system, api_key, model)
    elif provider == "deepseek":
        gen = _stream_openai_compat(payload.messages, payload.system, api_key, model, "https://api.deepseek.com/v1")
    else:
        gen = _stream_openai_compat(payload.messages, payload.system, api_key, model, "https://api.openai.com/v1")

    return StreamingResponse(gen, media_type="text/plain")


# ── Vision OCR proxy ─────────────────────────────────────────────────────────
@router.post("/ai/vision")
async def vision_ocr(payload: VisionRequest, user=Depends(get_current_user)):
    cfg = await _get_ai_config()
    if not cfg:
        raise HTTPException(status_code=400, detail="AI is not configured yet — ask your admin to add an API key.")
    provider = cfg["provider"]
    api_key = cfg["api_key"]
    model = PROVIDER_META[provider]["model"]

    async with httpx.AsyncClient(timeout=60.0) as client:
        if provider == "claude":
            res = await client.post(
                "https://api.anthropic.com/v1/messages",
                headers={"Content-Type": "application/json", "anthropic-version": "2023-06-01", "x-api-key": api_key},
                json={"model": model, "max_tokens": 2048, "messages": [{"role": "user", "content": [
                    {"type": "image", "source": {"type": "base64", "media_type": payload.media_type, "data": payload.image_base64}},
                    {"type": "text", "text": payload.prompt},
                ]}]},
            )
            if res.status_code != 200:
                raise HTTPException(status_code=502, detail=f"Claude vision API {res.status_code}: {res.text}")
            j = res.json()
            return {"text": "".join(c.get("text", "") for c in j.get("content", []))}
        elif provider == "gemini":
            url = f"https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent?key={api_key}"
            res = await client.post(url, json={
                "contents": [{"parts": [{"inline_data": {"mime_type": payload.media_type, "data": payload.image_base64}}, {"text": payload.prompt}]}],
                "generationConfig": {"maxOutputTokens": 2048, "thinkingConfig": {"thinkingBudget": 128 if "pro" in model else 0}},
            })
            if res.status_code != 200:
                raise HTTPException(status_code=502, detail=f"Gemini vision API {res.status_code}: {res.text}")
            j = res.json()
            parts = j.get("candidates", [{}])[0].get("content", {}).get("parts", [])
            return {"text": "".join(p.get("text", "") for p in parts if not p.get("thought"))}
        elif provider == "openai":
            res = await client.post(
                "https://api.openai.com/v1/chat/completions",
                headers={"Content-Type": "application/json", "Authorization": f"Bearer {api_key}"},
                json={"model": model, "max_tokens": 2048, "messages": [{"role": "user", "content": [
                    {"type": "text", "text": payload.prompt},
                    {"type": "image_url", "image_url": {"url": f"data:{payload.media_type};base64,{payload.image_base64}"}},
                ]}]},
            )
            if res.status_code != 200:
                raise HTTPException(status_code=502, detail=f"OpenAI vision API {res.status_code}: {res.text}")
            j = res.json()
            return {"text": j.get("choices", [{}])[0].get("message", {}).get("content", "")}
        else:
            raise HTTPException(status_code=400, detail=f"{provider} does not support image OCR — admin must configure Claude, Gemini, or OpenAI.")
