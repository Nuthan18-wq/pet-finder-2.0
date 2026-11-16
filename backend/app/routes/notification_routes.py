from __future__ import annotations

import uuid
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from backend.app.authentication.auth import get_current_user
from backend.app.database.connection import get_db

router = APIRouter(prefix="/notifications", tags=["Real-Time Alert Network"])


class PreferencesPayload(BaseModel):
    match_alerts: bool = True
    area_alerts: bool = True
    message_alerts: bool = True
    email_alerts: bool = False
    alert_radius_km: float = Field(default=10.0, gt=0, le=500)


@router.get("")
async def get_notifications(
    current_user: Dict[str, Any] = Depends(get_current_user),
) -> Dict[str, Any]:
    db = get_db()
    user_id = current_user["id"]

    all_notes = await (await db.notifications.find({"user_id": user_id})).to_list()
    unread_count = sum(1 for n in all_notes if not n.get("read_status", False))

    # Sort newest first
    all_notes.sort(key=lambda n: n.get("created_at", ""), reverse=True)
    for note in all_notes:
        note.pop("_id", None)

    return {
        "notifications": all_notes,
        "unread_count": unread_count,
    }


@router.put("/{notification_id}/read")
async def mark_notification_read(
    notification_id: str,
    current_user: Dict[str, Any] = Depends(get_current_user),
) -> Dict[str, str]:
    db = get_db()
    result = await db.notifications.update_one(
        {"id": notification_id, "user_id": current_user["id"]},
        {"$set": {"read_status": True}},
    )
    if not result.matched_count:
        raise HTTPException(status_code=404, detail="Notification not found.")
    return {"message": "Notification marked as read."}


@router.put("/read-all")
async def mark_all_read(
    current_user: Dict[str, Any] = Depends(get_current_user),
) -> Dict[str, str]:
    db = get_db()
    user_id = current_user["id"]
    notes = await (await db.notifications.find({"user_id": user_id})).to_list()
    for n in notes:
        await db.notifications.update_one({"id": n["id"]}, {"$set": {"read_status": True}})
    return {"message": "All notifications marked as read."}


@router.get("/preferences")
async def get_preferences(
    current_user: Dict[str, Any] = Depends(get_current_user),
) -> Dict[str, Any]:
    db = get_db()
    user = await db.users.find_one({"id": current_user["id"]})
    prefs = {
        "match_alerts": True,
        "area_alerts": True,
        "message_alerts": True,
        "email_alerts": False,
        "alert_radius_km": 10.0,
    }
    prefs.update((user or {}).get("notification_preferences", {}))
    return {"preferences": prefs}


@router.put("/preferences")
async def update_preferences(
    payload: PreferencesPayload,
    current_user: Dict[str, Any] = Depends(get_current_user),
) -> Dict[str, Any]:
    db = get_db()
    new_prefs = payload.model_dump()
    await db.users.update_one(
        {"id": current_user["id"]},
        {"$set": {"notification_preferences": new_prefs}},
    )
    return {
        "message": "Notification preferences updated successfully.",
        "preferences": new_prefs,
    }
