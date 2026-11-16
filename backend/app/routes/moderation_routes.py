from __future__ import annotations

import logging
from typing import Any, Dict, List
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from backend.app.authentication.auth import get_admin_user
from backend.app.database.connection import get_db

router = APIRouter(prefix="/moderation", tags=["AI Scam and Duplicate Report Detection"])
logger = logging.getLogger("pet_finder.moderation")


class ModerationAction(BaseModel):
    action: str  # "approve", "reject", "dismiss"
    notes: str = ""


@router.get("/flagged")
async def get_flagged_listings(admin: Dict[str, Any] = Depends(get_admin_user)) -> Dict[str, Any]:
    """
    Moderation queue: displays listings flagged by AI duplicate or pattern detection.
    """
    db = get_db()
    pets = await (await db.pets.find({"flagged_suspicious": True})).to_list()
    for p in pets:
        p.pop("embedding", None)
    return {"total": len(pets), "flagged_pets": pets}


@router.post("/{pet_id}/action")
async def take_moderation_action(
    pet_id: str,
    payload: ModerationAction,
    admin: Dict[str, Any] = Depends(get_admin_user),
) -> Dict[str, str]:
    db = get_db()
    pet = await db.pets.find_one({"id": pet_id})
    if not pet:
        raise HTTPException(status_code=404, detail="Pet not found.")

    if payload.action == "approve":
        await db.pets.update_one(
            {"id": pet_id},
            {"$set": {"flagged_suspicious": False, "moderation_status": "approved"}},
        )
        msg = "Listing approved and reinstated to active community listings."
    elif payload.action == "reject":
        await db.pets.update_one(
            {"id": pet_id},
            {"$set": {"status": "Closed", "moderation_status": "rejected", "moderation_notes": payload.notes}},
        )
        msg = "Listing rejected and removed from public search."
    elif payload.action == "dismiss":
        await db.pets.update_one(
            {"id": pet_id},
            {"$set": {"flagged_suspicious": False, "moderation_status": "flag_dismissed"}},
        )
        msg = "Flag dismissed."
    else:
        raise HTTPException(status_code=400, detail="Invalid moderation action.")

    return {"message": msg}


def check_for_duplicates_and_scams(
    new_embedding: List[float],
    existing_pets: List[Dict[str, Any]],
    user_id: str,
) -> Dict[str, Any]:
    """
    Evaluates newly submitted reports for exact duplicate photographs
    or suspicious reposting patterns.
    Never automatically labels the user as a scammer.
    """
    from backend.app.ai.embedding_engine import PetVisionEngine

    if not new_embedding:
        return {"flagged": False, "reason": None}

    for pet in existing_pets:
        existing_emb = pet.get("embedding")
        if not existing_emb:
            continue

        sim = PetVisionEngine.cosine_similarity(new_embedding, existing_emb)
        # Cosine similarity > 0.985 on CLIP indicates identical or cropped copy of existing photo
        if sim >= 0.985:
            other_user = pet.get("user_id")
            if other_user != user_id:
                return {
                    "flagged": True,
                    "reason": f"AI Duplicate Image Detection: This exact photograph is already registered under listing '{pet.get('pet_name')}' ({pet.get('id')}) by another reporter. Flagged for review.",
                    "matched_pet_id": pet.get("id"),
                    "similarity": round(sim, 4),
                }

    return {"flagged": False, "reason": None}
