from __future__ import annotations

import uuid
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from backend.app.authentication.auth import get_current_user
from backend.app.database.connection import get_db

router = APIRouter(prefix="/reunions", tags=["Pet Reunification Tracker"])


class ReunionRecordCreate(BaseModel):
    pet_id: str
    story: str = Field(..., min_length=10)
    reunion_date: Optional[str] = None
    finder_name: Optional[str] = None
    location: Optional[str] = None


@router.get("")
async def list_reunions() -> Dict[str, Any]:
    db = get_db()
    reunions = await (await db.reunions.find({})).to_list()
    # Sort newest first
    reunions.sort(key=lambda r: r.get("reunited_at", ""), reverse=True)
    for reunion in reunions:
        reunion.pop("_id", None)
    return {"total": len(reunions), "reunions": reunions}


@router.post("")
async def mark_pet_reunited(
    payload: ReunionRecordCreate,
    current_user: Dict[str, Any] = Depends(get_current_user),
) -> Dict[str, Any]:
    db = get_db()
    pet = await db.pets.find_one({"id": payload.pet_id})
    if not pet:
        raise HTTPException(status_code=404, detail="Pet not found.")
    if pet.get("status") not in ("Lost", "Found"):
        raise HTTPException(status_code=409, detail="This report is not open for reunification.")

    is_admin = current_user.get("role") == "admin"
    if pet.get("user_id") != current_user["id"] and not is_admin:
        raise HTTPException(status_code=403, detail="Only the pet owner can record a reunion.")

    now = datetime.now(timezone.utc).isoformat()
    reunion_date = payload.reunion_date or datetime.now().date().isoformat()

    # Update pet status to Reunited
    await db.pets.update_one(
        {"id": payload.pet_id},
        {"$set": {"status": "Reunited", "reunited_date": reunion_date}},
    )

    reunion_id = f"reunion-{uuid.uuid4().hex[:8]}"
    new_story = {
        "id": reunion_id,
        "pet_id": payload.pet_id,
        "pet_name": pet.get("pet_name", "Pet"),
        "pet_type": pet.get("pet_type", "Dog"),
        "breed": pet.get("breed", "Unknown"),
        "image": f"/api/pets/{pet['id']}/image",
        "reunion_photo": f"/api/pets/{pet['id']}/image",
        "owner_name": current_user.get("full_name", "Owner"),
        "finder_name": payload.finder_name.strip() if payload.finder_name else None,
        "location": payload.location.strip() if payload.location else None,
        "story": payload.story.strip(),
        "reunited_at": reunion_date,
        "created_at": now,
    }

    await db.reunions.insert_one(new_story)

    # Create a broadcast notification
    note_id = f"note-{uuid.uuid4().hex[:8]}"
    await db.notifications.insert_one({
        "id": note_id,
        "user_id": current_user["id"],
        "type": "reunion_alert",
        "title": f"Celebration: {pet.get('pet_name')} has been reunited!",
        "message": f"Congratulations! Your reunion story for {pet.get('pet_name')} has been published to the community.",
        "pet_id": payload.pet_id,
        "created_at": now,
        "read_status": False,
    })

    return {
        "message": f"Celebrations! {pet.get('pet_name')} is officially marked as Reunited.",
        "reunion": new_story,
    }
