from __future__ import annotations

import os
import uuid
from datetime import date, datetime, timezone
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Depends, HTTPException

from backend.app.ai.embedding_engine import get_vision_engine
from backend.app.authentication.auth import get_current_user, get_optional_user
from backend.app.database.connection import get_db
from backend.app.models.schemas import MatchReportCreate, MatchSearchResponse

router = APIRouter(prefix="/matches", tags=["AI Visual Matching"])
UPLOAD_DIR = os.path.join(os.path.dirname(__file__), "..", "..", "uploads")


def _load_vision_engine() -> Any:
    try:
        return get_vision_engine()
    except RuntimeError as exc:
        raise HTTPException(
            status_code=503,
            detail=f"OpenCLIP image matching is unavailable: {exc}",
        ) from exc


def _safe_pet(pet: Dict[str, Any]) -> Dict[str, Any]:
    result = pet.copy()
    result.pop("embedding", None)
    result.pop("_id", None)
    result["image"] = f"/api/pets/{result['id']}/image"
    return result


def _shared_characteristics(lost_pet: Dict[str, Any], found_pet: Dict[str, Any]) -> List[Dict[str, str]]:
    lost_analysis = lost_pet.get("ai_analysis") or {}
    found_analysis = found_pet.get("ai_analysis") or {}
    fields = ("animal_type", "colours", "fur_pattern", "visible_markings")
    shared = []
    for field in fields:
        lost_value = lost_analysis.get(field)
        found_value = found_analysis.get(field)
        if (
            isinstance(lost_value, str)
            and isinstance(found_value, str)
            and lost_value.strip().lower() == found_value.strip().lower()
            and lost_value.strip().lower() != "not clear"
        ):
            shared.append({"characteristic": field.replace("_", " "), "value": lost_value})
    return shared


def _match_metadata(lost_pet: Dict[str, Any], found_pet: Dict[str, Any]) -> Dict[str, Any]:
    metadata: Dict[str, Any] = {}
    if (
        lost_pet.get("location_shared") is True
        and found_pet.get("location_shared") is True
        and isinstance(lost_pet.get("latitude"), (int, float))
        and isinstance(lost_pet.get("longitude"), (int, float))
        and isinstance(found_pet.get("latitude"), (int, float))
        and isinstance(found_pet.get("longitude"), (int, float))
    ):
        from backend.app.routes.geo_routes import haversine_distance_km
        metadata["distance_km"] = haversine_distance_km(
            lost_pet["latitude"], lost_pet["longitude"],
            found_pet["latitude"], found_pet["longitude"],
        )
    try:
        lost_date = date.fromisoformat(lost_pet.get("date", ""))
        found_date = date.fromisoformat(found_pet.get("date", ""))
        metadata["date_difference_days"] = abs((lost_date - found_date).days)
    except (TypeError, ValueError):
        pass
    return metadata


@router.post("/search/{lost_pet_id}", response_model=MatchSearchResponse)
async def search_visual_matches(
    lost_pet_id: str,
    _current_user: Dict[str, Any] = Depends(get_current_user),
) -> Dict[str, Any]:
    """
    Core AI Visual Matching Engine:
    1. Loads target lost pet.
    2. Retrieves or regenerates its 512-dim OpenCLIP embedding.
    3. Fetches all candidate FOUND pets.
    4. Computes cosine similarity: Similarity(A, B) = (A · B) / (||A|| × ||B||)
    5. Ranks matches and assigns confidence badges.
    """
    db = get_db()
    engine = _load_vision_engine()

    lost_pet = await db.pets.find_one({"id": lost_pet_id})
    if not lost_pet:
        raise HTTPException(status_code=404, detail="Lost pet record not found.")
    if lost_pet.get("status") != "Lost":
        raise HTTPException(status_code=400, detail="Visual matching requires a lost-pet report.")

    query_embedding = lost_pet.get("embedding")
    # If pet embedding was not cached or empty, compute now from stored image
    if not query_embedding or len(query_embedding) == 0:
        img_val = lost_pet.get("image", "")
        if img_val.startswith("/uploads/"):
            local_path = os.path.join(UPLOAD_DIR, os.path.basename(img_val))
            if os.path.exists(local_path):
                query_embedding = engine.generate_embedding(local_path)
                await db.pets.update_one({"id": lost_pet_id}, {"$set": {"embedding": query_embedding}})

    if not query_embedding:
        raise HTTPException(
            status_code=400,
            detail="Cannot perform visual matching: No valid image embedding found for this pet.",
        )

    # Candidates: all Found pets (excluding self)
    candidates = await (await db.pets.find({"status": "Found"})).to_list()
    ranked_candidates = engine.rank_candidates(query_embedding, candidates, exclude_id=lost_pet_id)

    # Format response items
    now = datetime.now(timezone.utc).isoformat()
    match_items = []
    for cand in ranked_candidates:
        match_id = f"match-{lost_pet_id[-6:]}-{cand['pet_id'][-6:]}"
        # Enrich candidate owner
        found_pet_dict = _safe_pet(cand["pet"])

        match_items.append({
            "id": match_id,
            "lost_pet_id": lost_pet_id,
            "found_pet_id": cand["pet_id"],
            "similarity_score": cand["similarity_score"],
            "similarity_percentage": cand["similarity_percentage"],
            "confidence_badge": cand["confidence_badge"],
            "disclaimer": cand["disclaimer"],
            "matching_characteristics": _shared_characteristics(lost_pet, cand["pet"]),
            **_match_metadata(lost_pet, cand["pet"]),
            "found_pet": found_pet_dict,
            "lost_pet": _safe_pet(lost_pet),
            "created_at": now,
        })

    return {
        "lost_pet": _safe_pet(lost_pet),
        "total_matches": len(match_items),
        "matches": match_items,
    }


@router.get("/{lost_pet_id}", response_model=MatchSearchResponse)
async def get_matches_for_lost_pet(
    lost_pet_id: str,
    current_user: Dict[str, Any] = Depends(get_current_user),
) -> Dict[str, Any]:
    # Run dynamic search to ensure newly added found pets are always evaluated
    return await search_visual_matches(lost_pet_id, current_user)

@router.get("/search-found/{found_pet_id}")
async def search_matches_for_found_pet(
    found_pet_id: str,
    _current_user: Dict[str, Any] = Depends(get_current_user),
) -> Dict[str, Any]:
    db = get_db()
    engine = _load_vision_engine()
    found_pet = await db.pets.find_one({"id": found_pet_id, "status": "Found"})
    if not found_pet:
        raise HTTPException(status_code=404, detail="Found pet record not found.")
    embedding = found_pet.get("embedding")
    if not embedding:
        raise HTTPException(status_code=422, detail="No valid image embedding is available for this report.")
    candidates = await (await db.pets.find({"status": "Lost"})).to_list()
    ranked = engine.rank_candidates(embedding, candidates, exclude_id=found_pet_id)
    matches = []
    for candidate in ranked:
        matches.append({
            "id": f"match-{candidate['pet_id'][-6:]}-{found_pet_id[-6:]}",
            "lost_pet": _safe_pet(candidate["pet"]),
            "similarity_score": candidate["similarity_score"],
            "similarity_percentage": candidate["similarity_percentage"],
            "confidence_badge": candidate["confidence_badge"],
            "disclaimer": candidate["disclaimer"],
            "matching_characteristics": _shared_characteristics(candidate["pet"], found_pet),
            **_match_metadata(candidate["pet"], found_pet),
        })
    return {
        "found_pet": _safe_pet(found_pet),
        "total_matches": len(matches),
        "matches": matches,
    }


@router.post("/{match_id}/report")
async def report_incorrect_match(
    match_id: str,
    payload: MatchReportCreate,
    current_user: Optional[Dict[str, Any]] = Depends(get_optional_user),
) -> Dict[str, str]:
    db = get_db()
    report_id = f"report-{uuid.uuid4().hex[:8]}"
    now = datetime.now(timezone.utc).isoformat()

    await db.reports.insert_one({
        "id": report_id,
        "match_id": match_id,
        "reporter_id": current_user["id"] if current_user else "anonymous",
        "reason": payload.reason,
        "details": payload.details or "",
        "created_at": now,
        "status": "pending_review",
    })

    return {
        "message": "Thank you for helping refine the AI network. Your feedback has been recorded for review."
    }
