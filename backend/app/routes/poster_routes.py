from __future__ import annotations

import base64
import io
import os
from typing import Any, Dict, Optional
from fastapi import APIRouter, Depends, HTTPException, Query
import qrcode

from backend.app.authentication.auth import get_current_user
from backend.app.database.connection import get_db

router = APIRouter(prefix="/posters", tags=["AI Poster Generator"])


def generate_qr_code_base64(url: str) -> str:
    qr = qrcode.QRCode(
        version=1,
        error_correction=qrcode.constants.ERROR_CORRECT_M,
        box_size=10,
        border=2,
    )
    qr.add_data(url)
    qr.make(fit=True)
    img = qr.make_image(fill_color="black", back_color="white")
    
    buffer = io.BytesIO()
    img.save(buffer, format="PNG")
    b64_str = base64.b64encode(buffer.getvalue()).decode("utf-8")
    return f"data:image/png;base64,{b64_str}"


@router.get("/{pet_id}")
async def get_poster_data(
    pet_id: str,
    reward: Optional[str] = Query(None, max_length=120),
    headline: Optional[str] = Query(None),
    current_user: Dict[str, Any] = Depends(get_current_user),
) -> Dict[str, Any]:
    """
    Returns complete metadata and embedded QR code for generating and printing
    a high-resolution Missing Pet Poster without altering the original photograph.
    """
    db = get_db()
    pet = await db.pets.find_one({"id": pet_id})
    if not pet:
        raise HTTPException(status_code=404, detail="Pet not found.")
    if pet.get("status") != "Lost":
        raise HTTPException(status_code=400, detail="Posters are available for lost-pet reports.")
    if pet.get("user_id") != current_user["id"] and current_user.get("role") != "admin":
        raise HTTPException(status_code=403, detail="Only the report owner can create this poster.")

    frontend_base = os.getenv("FRONTEND_URL", "http://localhost:5173").rstrip("/")
    report_url = f"{frontend_base}/pets/{pet_id}"
    qr_base64 = generate_qr_code_base64(report_url)

    analysis = pet.get("ai_analysis") or {}
    distinctive_features = []
    for key, label in (
        ("colours", "Colour"),
        ("fur_pattern", "Pattern"),
        ("visible_markings", "Markings"),
        ("visible_accessories", "Accessories"),
    ):
        value = analysis.get(key)
        if isinstance(value, str) and value.strip() and value.strip().casefold() != "not clear":
            distinctive_features.append(f"{label}: {value.strip()}")

    default_headline = f"MISSING {pet.get('pet_type', 'PET').upper()}" if pet.get("status") == "Lost" else "FOUND PET - PLEASE SHARE"

    return {
        "pet_id": pet_id,
        "headline": headline or default_headline,
        "pet_name": pet.get("pet_name", "Unknown"),
        "pet_type": pet.get("pet_type", "Dog"),
        "breed": pet.get("breed", "Unknown"),
        "colour": pet.get("colour", "Unknown"),
        "age": pet.get("age", "Unknown"),
        "gender": pet.get("gender", "Unknown"),
        "location": pet.get("location", "Unknown"),
        "date": pet.get("date", "Recently"),
        "image": f"/api/pets/{pet_id}/image",
        "description": pet.get("description", ""),
        "reward": reward or "",
        "contact_method": "Contact the report owner through Pet-Finder secure chat.",
        "qr_code_data_url": qr_base64,
        "report_url": report_url,
        "distinctive_features": distinctive_features,
        "disclaimer": "Do not chase. If spotted, please scan QR code or contact immediately.",
    }
