from __future__ import annotations

import math
from typing import Any, Dict, List, Optional
from fastapi import APIRouter, Depends, HTTPException, Query
from backend.app.authentication.auth import get_current_user
from backend.app.database.connection import get_db

router = APIRouter(prefix="/geo", tags=["Smart Geo-Location Matching"])


def haversine_distance_km(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    """
    Computes the great-circle distance between two points on Earth in kilometers.
    Formula: d = 2R * asin(sqrt(sin^2(dlat/2) + cos(lat1)*cos(lat2)*sin^2(dlon/2)))
    """
    R = 6371.0  # Earth radius in km
    phi1, phi2 = math.radians(lat1), math.radians(lat2)
    delta_phi = math.radians(lat2 - lat1)
    delta_lambda = math.radians(lon2 - lon1)

    a = (
        math.sin(delta_phi / 2.0) ** 2
        + math.cos(phi1) * math.cos(phi2) * math.sin(delta_lambda / 2.0) ** 2
    )
    c = 2.0 * math.atan2(math.sqrt(a), math.sqrt(1.0 - a))
    return round(R * c, 2)


def _coordinates(pet: Dict[str, Any]) -> Optional[tuple[float, float]]:
    lat = pet.get("latitude")
    lng = pet.get("longitude")
    if (
        pet.get("location_shared") is not True
        or not isinstance(lat, (int, float))
        or not isinstance(lng, (int, float))
        or not -90 <= lat <= 90
        or not -180 <= lng <= 180
    ):
        return None
    return float(lat), float(lng)


def _public_map_pet(pet: Dict[str, Any]) -> Dict[str, Any]:
    result = pet.copy()
    result.pop("embedding", None)
    result.pop("_id", None)
    result.pop("user_id", None)
    coordinates = _coordinates(pet)
    if coordinates:
        result["latitude"] = round(coordinates[0], 2)
        result["longitude"] = round(coordinates[1], 2)
    result["image"] = f"/api/pets/{result['id']}/image"
    return result


@router.get("/pets")
async def get_geo_pets(
    lat: Optional[float] = Query(None, ge=-90, le=90),
    lng: Optional[float] = Query(None, ge=-180, le=180),
    radius_km: Optional[float] = Query(None, gt=0, le=500),
    status: Optional[str] = Query(None),
    pet_type: Optional[str] = Query(None),
    location: Optional[str] = Query(None, max_length=120),
    date_from: Optional[str] = Query(None),
    date_to: Optional[str] = Query(None),
) -> Dict[str, Any]:
    if (lat is None) != (lng is None):
        raise HTTPException(status_code=400, detail="Provide both latitude and longitude.")
    db = get_db()
    pets = await (await db.pets.find({})).to_list()

    results = []
    for pet in pets:
        if status and status.lower() != "all" and pet.get("status") != status:
            continue
        if pet_type and pet_type.lower() != "all" and pet.get("pet_type") != pet_type:
            continue
        if location and location.casefold() not in (pet.get("location") or "").casefold():
            continue
        if date_from and (pet.get("date") or "") < date_from:
            continue
        if date_to and (pet.get("date") or "") > date_to:
            continue
        coordinates = _coordinates(pet)
        if not coordinates:
            continue

        distance = None
        if lat is not None and lng is not None:
            distance = haversine_distance_km(lat, lng, coordinates[0], coordinates[1])
            if radius_km is not None and distance > radius_km:
                continue

        pet_clean = _public_map_pet(pet)
        pet_clean["distance_km"] = distance
        results.append(pet_clean)

    if lat is not None and lng is not None:
        results.sort(key=lambda p: p.get("distance_km", 9999))

    return {
        "center": {"latitude": lat, "longitude": lng} if lat is not None else None,
        "radius_km": radius_km,
        "total": len(results),
        "pets": results,
    }


@router.get("/proximity-matches/{lost_pet_id}")
async def get_proximity_matches(
    lost_pet_id: str,
    radius_km: float = Query(10.0, gt=0, le=500),
    current_user: Dict[str, Any] = Depends(get_current_user),
) -> Dict[str, Any]:
    db = get_db()
    from backend.app.ai.embedding_engine import get_vision_engine

    engine = get_vision_engine()
    lost_pet = await db.pets.find_one({"id": lost_pet_id})
    if not lost_pet:
        raise HTTPException(status_code=404, detail="Lost pet not found.")
    if lost_pet.get("user_id") != current_user["id"] and current_user.get("role") != "admin":
        raise HTTPException(status_code=403, detail="Only the report owner can search nearby matches.")
    lost_coordinates = _coordinates(lost_pet)
    if not lost_coordinates:
        raise HTTPException(status_code=422, detail="This report has no shared location.")
    l_emb = lost_pet.get("embedding", [])
    if not l_emb:
        raise HTTPException(status_code=422, detail="This report has no visual embedding.")

    candidates = await (await db.pets.find({"status": "Found"})).to_list()
    ranked = []

    for c in candidates:
        if c.get("id") == lost_pet_id:
            continue
        candidate_coordinates = _coordinates(c)
        c_emb = c.get("embedding", [])
        if not candidate_coordinates or not c_emb:
            continue
        dist = haversine_distance_km(
            lost_coordinates[0], lost_coordinates[1],
            candidate_coordinates[0], candidate_coordinates[1],
        )
        if dist <= radius_km:
            vis_sim = engine.cosine_similarity(l_emb, c_emb)
            proximity_score = max(0.1, 1.0 - (dist / radius_km) * 0.8)
            composite_score = round(0.65 * vis_sim + 0.35 * proximity_score, 4)

            c_clean = _public_map_pet(c)

            ranked.append({
                "found_pet": c_clean,
                "distance_km": dist,
                "visual_similarity": round(vis_sim, 4),
                "visual_percentage": round(vis_sim * 100, 1),
                "composite_score": composite_score,
                "composite_percentage": round(composite_score * 100, 1),
                "confidence_badge": engine.get_confidence_badge(vis_sim),
            })

    ranked.sort(key=lambda x: x["composite_score"], reverse=True)

    return {
        "lost_pet_id": lost_pet_id,
        "search_radius_km": radius_km,
        "total_nearby_matches": len(ranked),
        "matches": ranked,
    }
