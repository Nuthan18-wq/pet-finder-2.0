from __future__ import annotations

from typing import Any, Dict, List

from fastapi import APIRouter, Depends

from backend.app.authentication.auth import get_current_user
from backend.app.database.connection import get_db

router = APIRouter(prefix="/dashboard", tags=["User Mission Control"])


def _safe_pet(pet: Dict[str, Any]) -> Dict[str, Any]:
    result = pet.copy()
    result.pop("_id", None)
    result.pop("embedding", None)
    result.pop("user_id", None)
    if result.get("location_shared") and isinstance(result.get("latitude"), (int, float)) and isinstance(result.get("longitude"), (int, float)):
        result["latitude"] = round(result["latitude"], 2)
        result["longitude"] = round(result["longitude"], 2)
    else:
        result.pop("latitude", None)
        result.pop("longitude", None)
        result["location_shared"] = False
    result["image"] = f"/api/pets/{result['id']}/image"
    return result


@router.get("/overview")
async def get_dashboard_overview(
    current_user: Dict[str, Any] = Depends(get_current_user),
) -> Dict[str, Any]:
    db = get_db()
    all_pets = await (await db.pets.find({})).to_list()
    all_pets.sort(key=lambda pet: pet.get("created_at", ""), reverse=True)

    active_pets = [pet for pet in all_pets if pet.get("status") in ("Lost", "Found")]
    lost_pets = [pet for pet in all_pets if pet.get("status") == "Lost"]
    found_pets = [pet for pet in all_pets if pet.get("status") == "Found"]
    reunited_pets = [pet for pet in all_pets if pet.get("status") == "Reunited"]
    user_pets = [pet for pet in all_pets if pet.get("user_id") == current_user["id"]]
    user_pet_ids = {pet.get("id") for pet in user_pets}

    all_matches = await (await db.matches.find({})).to_list()
    user_matches = [
        match for match in all_matches
        if match.get("lost_pet_id") in user_pet_ids or match.get("found_pet_id") in user_pet_ids
    ]
    user_matches.sort(key=lambda match: match.get("created_at", ""), reverse=True)

    match_details: List[Dict[str, Any]] = []
    for match in user_matches[:5]:
        lost_pet = await db.pets.find_one({"id": match.get("lost_pet_id")})
        found_pet = await db.pets.find_one({"id": match.get("found_pet_id")})
        if not lost_pet or not found_pet:
            continue
        item = match.copy()
        item.pop("_id", None)
        item["lost_pet"] = _safe_pet(lost_pet)
        item["found_pet"] = _safe_pet(found_pet)
        item["lost_pet"]["user_id"] = lost_pet.get("user_id")
        item["found_pet"]["user_id"] = found_pet.get("user_id")
        match_details.append(item)

    recent_conversations = await (await db.conversations.find({})).to_list()
    recent_conversations = [
        conversation for conversation in recent_conversations
        if current_user["id"] in conversation.get("participants", [])
    ]
    recent_conversations.sort(
        key=lambda conversation: conversation.get("updated_at", ""),
        reverse=True,
    )
    unread_notifications = await db.notifications.count_documents({
        "user_id": current_user["id"],
        "read_status": False,
    })

    return {
        "stats": {
            "total_lost_pets": len(lost_pets),
            "total_found_pets": len(found_pets),
            "potential_ai_matches": len(user_matches),
            "reunited_pets": len(reunited_pets),
        },
        "activity_by_status": {
            "lost": len(lost_pets),
            "found": len(found_pets),
            "reunited": len(reunited_pets),
            "closed": sum(1 for pet in all_pets if pet.get("status") == "Closed"),
        },
        "recent_reports": [_safe_pet(pet) for pet in active_pets[:6]],
        "my_reports": [_safe_pet(pet) for pet in user_pets],
        "recent_matches": match_details,
        "recent_conversations": [
            {
                "id": conversation.get("id"),
                "pet_id": conversation.get("pet_id"),
                "updated_at": conversation.get("updated_at", conversation.get("created_at", "")),
            }
            for conversation in recent_conversations[:5]
        ],
        "unread_notifications": unread_notifications,
    }
