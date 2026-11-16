from __future__ import annotations


import json
import os
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile, status
from pydantic import BaseModel, Field
from typing import Literal

from backend.app.ai.gemini_engine import (
    chat_assistant,
    explain_pet_match,
    generate_social_announcement,
    analyze_pet_image,
    translate_text,
)
from backend.app.ai.quality_checker import PhotoQualityChecker
from backend.app.authentication.auth import get_current_user
from backend.app.database.connection import get_db

router = APIRouter(prefix="/ai", tags=["Generative AI & Visual Intelligence"])
UPLOAD_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", "uploads"))
MAX_FILE_SIZE = 10 * 1024 * 1024
MIME_TYPES = {".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".png": "image/png", ".webp": "image/webp"}


class ChatRequest(BaseModel):
    message: str = Field(..., min_length=1, max_length=2000)
    language: str = "en"
    history: List[Dict[str, str]] = Field(default_factory=list)


class AnnouncementRequest(BaseModel):
    pet_id: str
    language: Literal["en", "kn", "hi"] = "en"


class TranslateRequest(BaseModel):
    text: str = Field(..., min_length=1)
    target_lang: Literal["en", "kn", "hi"] = "kn"
    source_lang: Literal["en", "kn", "hi"] = "en"


def _read_pet_image(pet: Dict[str, Any]) -> tuple[bytes, str]:
    image = pet.get("image", "")
    filename = os.path.basename(image)
    if not image.startswith("/uploads/") or not filename:
        raise HTTPException(status_code=404, detail="Pet photograph not found.")
    upload_root = os.path.abspath(UPLOAD_DIR)
    path = os.path.abspath(os.path.join(upload_root, filename))
    if os.path.commonpath([upload_root, path]) != upload_root or not os.path.isfile(path):
        raise HTTPException(status_code=404, detail="Pet photograph not found.")
    extension = os.path.splitext(filename)[1].lower()
    mime_type = MIME_TYPES.get(extension)
    if not mime_type:
        raise HTTPException(status_code=415, detail="Pet photograph format is not supported.")
    with open(path, "rb") as file:
        return file.read(), mime_type


@router.post("/photo-quality")
async def check_photo_quality(
    image: UploadFile = File(...),
) -> Dict[str, Any]:
    """
    Evaluates blurriness, exposure, resolution, and subject visibility
    prior to submitting lost or found pet reports.
    """
    image_bytes = await image.read(MAX_FILE_SIZE + 1)
    if len(image_bytes) > MAX_FILE_SIZE:
        raise HTTPException(status_code=413, detail="Image must be 10MB or smaller.")

    result = PhotoQualityChecker.evaluate_image(image_bytes)
    return result


@router.post("/analyze-image")
async def analyze_uploaded_pet_image(
    image: UploadFile = File(...),
    _current_user: Dict[str, Any] = Depends(get_current_user),
) -> Dict[str, Any]:
    extension = os.path.splitext(image.filename or "")[1].lower()
    mime_type = MIME_TYPES.get(extension)
    if not mime_type:
        raise HTTPException(status_code=415, detail="Upload a JPG, PNG, or WebP photograph.")
    image_bytes = await image.read(MAX_FILE_SIZE + 1)
    if len(image_bytes) > MAX_FILE_SIZE:
        raise HTTPException(status_code=413, detail="Image must be 10MB or smaller.")
    try:
        analysis = await analyze_pet_image(image_bytes, mime_type)
    except RuntimeError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    except Exception as exc:
        raise HTTPException(status_code=502, detail="Gemini image analysis failed.") from exc
    return {"analysis": analysis, "provider": "gemini"}


@router.post("/explain-match/{lost_pet_id}/{found_pet_id}")
async def explain_match(
    lost_pet_id: str,
    found_pet_id: str,
    current_user: Dict[str, Any] = Depends(get_current_user),
) -> Dict[str, Any]:
    db = get_db()
    lost_pet = await db.pets.find_one({"id": lost_pet_id, "status": "Lost"})
    found_pet = await db.pets.find_one({"id": found_pet_id, "status": "Found"})
    if not lost_pet or not found_pet:
        raise HTTPException(status_code=404, detail="Potential match reports were not found.")
    if current_user["id"] not in (lost_pet.get("user_id"), found_pet.get("user_id")):
        raise HTTPException(status_code=403, detail="Only a report owner can request this comparison.")
    lost_bytes, lost_mime = _read_pet_image(lost_pet)
    found_bytes, found_mime = _read_pet_image(found_pet)
    try:
        explanation = await explain_pet_match(
            lost_bytes,
            lost_mime,
            found_bytes,
            found_mime,
            lost_pet.get("description", ""),
            found_pet.get("description", ""),
        )
    except RuntimeError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    except Exception as exc:
        raise HTTPException(status_code=502, detail="Gemini match explanation failed.") from exc
    return {"explanation": explanation, "provider": "gemini"}


@router.post("/assistant/chat")
async def chat_with_assistant(
    payload: ChatRequest,
    _current_user: Optional[Dict[str, Any]] = Depends(get_current_user),
) -> Dict[str, Any]:
    """
    Conversational GenAI Pet Recovery Assistant.
    Supports English, Kannada, and Hindi.
    """
    try:
        response = await chat_assistant(
            conversation_history=payload.history,
            user_message=payload.message,
            language=payload.language,
        )
    except RuntimeError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    return response


@router.post("/assistant/announcement")
async def get_social_announcement(
    payload: AnnouncementRequest,
    current_user: Dict[str, Any] = Depends(get_current_user),
) -> Dict[str, Any]:
    """
    Generates tailored social media and WhatsApp broadcasts for missing pets.
    """
    db = get_db()
    pet = await db.pets.find_one({"id": payload.pet_id})
    if not pet:
        raise HTTPException(status_code=404, detail="Pet record not found.")
    if pet.get("status") != "Lost":
        raise HTTPException(status_code=400, detail="Announcements are only available for lost-pet reports.")
    if pet.get("user_id") != current_user["id"] and current_user.get("role") != "admin":
        raise HTTPException(status_code=403, detail="Only the report owner can generate this announcement.")

    try:
        announcement = await generate_social_announcement(pet, language=payload.language)
    except RuntimeError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    return announcement


@router.post("/translate")
async def translate_content(
    payload: TranslateRequest,
    _current_user: Dict[str, Any] = Depends(get_current_user),
) -> Dict[str, str]:
    """
    Translates descriptions, chat messages, or reports between English, Kannada, and Hindi.
    """
    try:
        translated = await translate_text(
            text=payload.text,
            target_lang=payload.target_lang,
            source_lang=payload.source_lang,
        )
    except RuntimeError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    return {
        "original_text": payload.text,
        "translated_text": translated,
        "target_lang": payload.target_lang,
    }


@router.get("/fingerprint/{pet_id}")
async def get_pet_fingerprint(
    pet_id: str,
    current_user: Dict[str, Any] = Depends(get_current_user),
) -> Dict[str, Any]:
    """
    Retrieves or generates the AI visual characteristic fingerprint for a pet.
    """
    db = get_db()
    pet = await db.pets.find_one({"id": pet_id})
    if not pet:
        raise HTTPException(status_code=404, detail="Pet not found.")
    if pet.get("user_id") != current_user["id"] and current_user.get("role") != "admin":
        raise HTTPException(status_code=403, detail="Only the report owner can view this analysis.")
    analysis = pet.get("ai_analysis")
    if not analysis:
        image_bytes, mime_type = _read_pet_image(pet)
        try:
            analysis = await analyze_pet_image(image_bytes, mime_type)
        except RuntimeError as exc:
            raise HTTPException(status_code=503, detail=str(exc)) from exc
        await db.pets.update_one({"id": pet_id}, {"$set": {"ai_analysis": analysis}})
    return {"pet_id": pet_id, "analysis": analysis, "provider": "gemini"}
