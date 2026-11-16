from __future__ import annotations

from typing import Any, Dict

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from backend.app.authentication.auth import get_admin_user
from backend.app.database.connection import get_db
from backend.app.models.schemas import AdminDashboardStats

router = APIRouter(prefix="/admin", tags=["Admin Portal"])


class StatusUpdatePayload(BaseModel):
    status: str = Field(pattern="^(Lost|Found|Reunited|Closed)$")


@router.get("/dashboard", response_model=AdminDashboardStats)
async def get_admin_dashboard(_current_user: Dict[str, Any] = Depends(get_admin_user)) -> Dict[str, int]:
    db = get_db()
    total_users = await db.users.count_documents({})
    total_lost = await db.pets.count_documents({"status": "Lost"})
    total_found = await db.pets.count_documents({"status": "Found"})
    total_reunited = await db.pets.count_documents({"status": "Reunited"})
    total_closed = await db.pets.count_documents({"status": "Closed"})
    total_matches = await db.matches.count_documents({})

    return {
        "total_users": total_users,
        "total_lost_reports": total_lost,
        "total_found_reports": total_found,
        "potential_ai_matches": total_matches,
        "reunited_pets": total_reunited,
        "closed_cases": total_closed,
    }


@router.get("/users")
async def list_admin_users(_admin: Dict[str, Any] = Depends(get_admin_user)) -> Dict[str, Any]:
    db = get_db()
    users = await (await db.users.find({})).to_list()
    # Strip password hashes for security
    sanitized = []
    for u in users:
        u_copy = u.copy()
        u_copy.pop("password_hash", None)
        u_copy.pop("_id", None)
        sanitized.append(u_copy)
    return {"users": sanitized, "total": len(sanitized)}


@router.get("/pets")
async def list_admin_pets(_admin: Dict[str, Any] = Depends(get_admin_user)) -> Dict[str, Any]:
    db = get_db()
    pets = await (await db.pets.find({})).to_list()
    # Strip heavy embeddings for payload size
    for p in pets:
        p.pop("embedding", None)
        p.pop("_id", None)
        if p.get("id"):
            p["image"] = f"/api/pets/{p['id']}/image"
    return {"pets": pets, "total": len(pets)}


@router.put("/pets/{pet_id}/status")
async def update_pet_status_admin(
    pet_id: str,
    payload: StatusUpdatePayload,
    _admin: Dict[str, Any] = Depends(get_admin_user),
) -> Dict[str, str]:
    db = get_db()
    pet = await db.pets.find_one({"id": pet_id})
    if not pet:
        raise HTTPException(status_code=404, detail="Pet not found.")

    await db.pets.update_one({"id": pet_id}, {"$set": {"status": payload.status}})
    return {"message": f"Pet status updated to '{payload.status}' successfully."}


@router.get("/reports")
async def list_flagged_reports(_admin: Dict[str, Any] = Depends(get_admin_user)) -> Dict[str, Any]:
    db = get_db()
    reports = await (await db.reports.find({})).to_list()
    for report in reports:
        report.pop("_id", None)
    return {"reports": reports, "total": len(reports)}


@router.put("/reports/{report_id}/resolve")
async def resolve_report(
    report_id: str,
    _admin: Dict[str, Any] = Depends(get_admin_user),
) -> Dict[str, str]:
    db = get_db()
    await db.reports.update_one({"id": report_id}, {"$set": {"status": "resolved"}})
    return {"message": "Report status marked as resolved."}
