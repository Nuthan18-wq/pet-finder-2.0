from __future__ import annotations

import uuid
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional
from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field

from backend.app.authentication.auth import get_admin_user
from backend.app.database.connection import get_db

router = APIRouter(prefix="/shelters", tags=["Veterinary and Shelter Network"])


class OrganizationRegister(BaseModel):
    name: str = Field(..., min_length=2)
    type: str = Field(..., pattern="^(Veterinary Hospital|Animal Shelter|Rescue NGO)$")
    address: str
    city: str
    phone: str
    emergency_phone: Optional[str] = None
    email: Optional[str] = None
    website: Optional[str] = None
    services: List[str] = Field(default_factory=list)
    latitude: Optional[float] = None
    longitude: Optional[float] = None


@router.get("/all")
async def list_organizations(
    org_type: Optional[str] = Query(None),
    city: Optional[str] = Query(None),
) -> Dict[str, Any]:
    db = get_db()
    query = {}
    if org_type and org_type.lower() != "all":
        query["type"] = org_type
    if city and city.lower() != "all":
        query["city"] = city

    query["verified"] = True
    orgs = await (await db.organizations.find(query)).to_list()
    for organization in orgs:
        organization.pop("_id", None)
    return {"total": len(orgs), "organizations": orgs}


@router.post("/register")
async def register_organization(
    payload: OrganizationRegister,
    _admin: Dict[str, Any] = Depends(get_admin_user),
) -> Dict[str, Any]:
    if (payload.latitude is None) != (payload.longitude is None):
        raise HTTPException(status_code=400, detail="Provide both latitude and longitude.")
    if payload.latitude is not None and not -90 <= payload.latitude <= 90:
        raise HTTPException(status_code=400, detail="Invalid latitude.")
    if payload.longitude is not None and not -180 <= payload.longitude <= 180:
        raise HTTPException(status_code=400, detail="Invalid longitude.")
    db = get_db()
    now = datetime.now(timezone.utc).isoformat()
    org_id = f"org-{uuid.uuid4().hex[:8]}"

    new_org = {
        "id": org_id,
        "name": payload.name.strip(),
        "type": payload.type,
        "address": payload.address.strip(),
        "city": payload.city.strip(),
        "phone": payload.phone.strip(),
        "emergency_phone": payload.emergency_phone or payload.phone,
        "email": payload.email or "",
        "website": payload.website or "",
        "services": payload.services,
        "latitude": payload.latitude,
        "longitude": payload.longitude,
        "verified": True,
        "created_at": now,
    }

    await db.organizations.insert_one(new_org)
    return {
        "message": f"{payload.name} registered into the Veterinary and Shelter Network.",
        "organization": new_org,
    }
