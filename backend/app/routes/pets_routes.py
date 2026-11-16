from __future__ import annotations

import os
import uuid
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

from fastapi import (
    APIRouter,
    Depends,
    File,
    Form,
    HTTPException,
    Query,
    UploadFile,
    status,
)
from fastapi.responses import FileResponse

from backend.app.ai.embedding_engine import get_vision_engine
from backend.app.ai.gemini_engine import analyze_pet_image
from backend.app.authentication.auth import get_current_user, get_optional_user
from backend.app.database.connection import get_db
from backend.app.models.schemas import PetResponse, PetUpdate

router = APIRouter(prefix="/pets", tags=["Pets"])
UPLOAD_DIR = os.path.join(os.path.dirname(__file__), "..", "..", "uploads")
ALLOWED_EXTENSIONS = {".jpg", ".jpeg", ".png", ".webp"}
MAX_FILE_SIZE = 10 * 1024 * 1024  # 10MB
MIME_TYPES = {".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".png": "image/png", ".webp": "image/webp"}


def _save_upload_file(file: UploadFile) -> tuple[str, bytes]:
    ext = os.path.splitext(file.filename or "")[1].lower()
    if ext not in ALLOWED_EXTENSIONS:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Unsupported file format '{ext}'. Please upload JPG, PNG, or WebP.",
        )

    file_bytes = file.file.read()
    if len(file_bytes) > MAX_FILE_SIZE:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="File size exceeds the 10MB limit.",
        )

    os.makedirs(UPLOAD_DIR, exist_ok=True)
    filename = f"pet_{uuid.uuid4().hex[:12]}{ext}"
    dest_path = os.path.join(UPLOAD_DIR, filename)
    with open(dest_path, "wb") as f:
        f.write(file_bytes)

    return f"/uploads/{filename}", file_bytes


def _public_pet(pet: Dict[str, Any]) -> Dict[str, Any]:
    pet.pop("embedding", None)
    pet.pop("_id", None)
    pet.pop("user_id", None)
    if pet.get("location_shared") and isinstance(pet.get("latitude"), (int, float)) and isinstance(pet.get("longitude"), (int, float)):
        pet["latitude"] = round(pet["latitude"], 2)
        pet["longitude"] = round(pet["longitude"], 2)
    else:
        pet.pop("latitude", None)
        pet.pop("longitude", None)
        pet["location_shared"] = False
    if pet.get("id"):
        pet["image"] = f"/api/pets/{pet['id']}/image"
    return pet


def _load_vision_engine() -> Any:
    try:
        return get_vision_engine()
    except RuntimeError as exc:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=f"OpenCLIP image matching is unavailable: {exc}",
        ) from exc


def _filter_pets(pets: List[Dict[str, Any]], breed: Optional[str], location: Optional[str]) -> List[Dict[str, Any]]:
    filtered = pets
    if breed:
        breed_query = breed.casefold()
        filtered = [pet for pet in filtered if breed_query in (pet.get("breed") or "").casefold()]
    if location:
        location_query = location.casefold()
        filtered = [pet for pet in filtered if location_query in (pet.get("location") or "").casefold()]
    return filtered


def _shared_coordinates(
    share_location: bool,
    latitude: Optional[float],
    longitude: Optional[float],
) -> Dict[str, Any]:
    if not share_location:
        return {"latitude": None, "longitude": None, "location_shared": False}
    if latitude is None or longitude is None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Allow location access to share map coordinates, or turn off location sharing.",
        )
    if not -90 <= latitude <= 90 or not -180 <= longitude <= 180:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid map coordinates.")
    return {
        "latitude": round(latitude, 2),
        "longitude": round(longitude, 2),
        "location_shared": True,
    }


async def _notify_match_owners(
    db: Any,
    lost_pet: Dict[str, Any],
    found_pet: Dict[str, Any],
    match_id: str,
    created_at: str,
) -> None:
    for owner_id, related_pet in (
        (lost_pet.get("user_id"), found_pet),
        (found_pet.get("user_id"), lost_pet),
    ):
        if not owner_id:
            continue
        owner = await db.users.find_one({"id": owner_id})
        preferences = (owner or {}).get("notification_preferences", {})
        if preferences.get("match_alerts", True) is False:
            continue
        await db.notifications.insert_one({
            "id": f"note-{uuid.uuid4().hex[:8]}",
            "user_id": owner_id,
            "type": "potential_match",
            "title": "A new potential visual match",
            "message": f"A new report may visually match {lost_pet.get('pet_name') or 'your pet'}.",
            "pet_id": related_pet.get("id"),
            "match_id": match_id,
            "created_at": created_at,
            "read_status": False,
        })


async def _notify_nearby_lost_owners(
    db: Any,
    found_pet: Dict[str, Any],
    created_at: str,
) -> None:
    if not found_pet.get("location_shared"):
        return
    found_lat = found_pet.get("latitude")
    found_lng = found_pet.get("longitude")
    if not isinstance(found_lat, (int, float)) or not isinstance(found_lng, (int, float)):
        return
    lost_pets = await (await db.pets.find({"status": "Lost"})).to_list()
    for lost_pet in lost_pets:
        if lost_pet.get("user_id") == found_pet.get("user_id") or not lost_pet.get("location_shared"):
            continue
        lost_lat = lost_pet.get("latitude")
        lost_lng = lost_pet.get("longitude")
        if not isinstance(lost_lat, (int, float)) or not isinstance(lost_lng, (int, float)):
            continue
        from backend.app.routes.geo_routes import haversine_distance_km
        distance = haversine_distance_km(found_lat, found_lng, lost_lat, lost_lng)
        owner_id = lost_pet.get("user_id")
        owner = await db.users.find_one({"id": owner_id})
        preferences = (owner or {}).get("notification_preferences", {})
        if (
            owner_id
            and preferences.get("area_alerts", True) is not False
            and distance <= preferences.get("alert_radius_km", 10.0)
        ):
            await db.notifications.insert_one({
                "id": f"note-{uuid.uuid4().hex[:8]}",
                "user_id": owner_id,
                "type": "nearby_found_pet",
                "title": "A found-pet report is nearby",
                "message": f"A found-pet report was submitted about {distance:.1f} km from your lost-pet report.",
                "pet_id": found_pet.get("id"),
                "created_at": created_at,
                "read_status": False,
            })


async def _analyze_if_configured(image_bytes: bytes, filename: str) -> Optional[Dict[str, Any]]:
    if not os.getenv("GEMINI_API_KEY"):
        return None
    extension = os.path.splitext(filename)[1].lower()
    try:
        return await analyze_pet_image(image_bytes, MIME_TYPES[extension])
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"Gemini image analysis failed: {exc}",
        ) from exc


@router.post("/lost")
async def create_lost_pet(
    pet_name: str = Form(..., alias="petName"),
    pet_type: str = Form("Dog", alias="petType"),
    breed: Optional[str] = Form(None),
    colour: Optional[str] = Form(None),
    gender: Optional[str] = Form(None),
    age: Optional[str] = Form(None),
    location: str = Form(...),
    date: Optional[str] = Form(None),
    description: Optional[str] = Form(None),
    contact_preference: Optional[str] = Form("In-App Secure Chat", alias="contactPreference"),
    latitude: Optional[float] = Form(None),
    longitude: Optional[float] = Form(None),
    share_location: bool = Form(False),
    image: Optional[UploadFile] = File(None),
    current_user: Dict[str, Any] = Depends(get_current_user),
) -> Dict[str, Any]:
    db = get_db()
    engine = _load_vision_engine()
    now = datetime.now(timezone.utc).isoformat()
    pet_id = f"pet-lost-{uuid.uuid4().hex[:8]}"

    # Process image
    saved_url = ""
    embedding: List[float] = []
    image_analysis: Optional[Dict[str, Any]] = None

    if image and image.filename:
        saved_url, file_bytes = _save_upload_file(image)
        try:
            embedding = engine.generate_embedding(file_bytes)
            image_analysis = await _analyze_if_configured(file_bytes, image.filename)
        except Exception as e:
            if saved_url:
                try:
                    os.remove(os.path.join(UPLOAD_DIR, os.path.basename(saved_url)))
                except OSError:
                    pass
            if isinstance(e, HTTPException):
                raise
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail=f"Image processing failed: {str(e)}",
            )
    else:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Pet photograph is required for AI visual matching.",
        )

    user_id = current_user["id"]
    shared_coordinates = _shared_coordinates(share_location, latitude, longitude)

    new_pet = {
        "id": pet_id,
        "user_id": user_id,
        "pet_name": pet_name.strip(),
        "pet_type": pet_type,
        "breed": (breed or "Unknown").strip(),
        "colour": (colour or "Unknown").strip(),
        "gender": gender,
        "age": age,
        "location": location.strip(),
        "date": date or datetime.now().date().isoformat(),
        "status": "Lost",
        "description": (description or (image_analysis or {}).get("description") or "").strip(),
        "image": saved_url,
        "embedding": embedding,
        "ai_analysis": image_analysis,
        "contact_preference": contact_preference,
        **shared_coordinates,
        "created_at": now,
    }

    await db.pets.insert_one(new_pet)

    # Perform immediate AI visual matching against all FOUND pets
    candidate_pets = await (await db.pets.find({"status": "Found"})).to_list()
    ranked_matches = engine.rank_candidates(embedding, candidate_pets, exclude_id=pet_id)

    # Persist top matches
    for match in ranked_matches:
        match_id = f"match-{uuid.uuid4().hex[:8]}"
        await db.matches.insert_one({
            "id": match_id,
            "lost_pet_id": pet_id,
            "found_pet_id": match["pet_id"],
            "similarity_score": match["similarity_score"],
            "similarity_percentage": match["similarity_percentage"],
            "confidence_badge": match["confidence_badge"],
            "match_status": "Potential Match",
            "created_at": now,
        })
        found_pet = match["pet"]
        await _notify_match_owners(db, new_pet, found_pet, match_id, now)

    safe_matches = []
    for match in ranked_matches:
        match_copy = match.copy()
        match_copy["pet"] = _public_pet(match_copy["pet"].copy())
        safe_matches.append(match_copy)

    return {
        "message": "Lost pet report registered successfully.",
        "pet": _public_pet(new_pet.copy()),
        "matches": safe_matches,
        "total_matches": len(safe_matches),
    }


@router.post("/found")
async def create_found_pet(
    pet_name: Optional[str] = Form(None, alias="petName"),
    pet_type: str = Form("Dog", alias="petType"),
    breed: Optional[str] = Form(None),
    colour: Optional[str] = Form(None),
    gender: Optional[str] = Form(None),
    age: Optional[str] = Form(None),
    location: str = Form(...),
    date: Optional[str] = Form(None),
    description: Optional[str] = Form(None),
    contact_preference: Optional[str] = Form("In-App Secure Chat", alias="contactPreference"),
    latitude: Optional[float] = Form(None),
    longitude: Optional[float] = Form(None),
    share_location: bool = Form(False),
    image: Optional[UploadFile] = File(None),
    current_user: Dict[str, Any] = Depends(get_current_user),
) -> Dict[str, Any]:
    db = get_db()
    engine = _load_vision_engine()
    now = datetime.now(timezone.utc).isoformat()
    pet_id = f"pet-found-{uuid.uuid4().hex[:8]}"

    saved_url = ""
    embedding: List[float] = []
    image_analysis: Optional[Dict[str, Any]] = None

    if image and image.filename:
        saved_url, file_bytes = _save_upload_file(image)
        try:
            embedding = engine.generate_embedding(file_bytes)
            image_analysis = await _analyze_if_configured(file_bytes, image.filename)
        except Exception as e:
            if saved_url:
                try:
                    os.remove(os.path.join(UPLOAD_DIR, os.path.basename(saved_url)))
                except OSError:
                    pass
            if isinstance(e, HTTPException):
                raise
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail=f"Image processing failed: {str(e)}",
            )
    else:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Pet photograph is required to index in the AI visual network.",
        )

    user_id = current_user["id"]
    shared_coordinates = _shared_coordinates(share_location, latitude, longitude)

    new_pet = {
        "id": pet_id,
        "user_id": user_id,
        "pet_name": (pet_name or "Found Pet").strip(),
        "pet_type": pet_type,
        "breed": (breed or "Unknown").strip(),
        "colour": (colour or "Unknown").strip(),
        "gender": gender,
        "age": age,
        "location": location.strip(),
        "date": date or datetime.now().date().isoformat(),
        "status": "Found",
        "description": (description or (image_analysis or {}).get("description") or "").strip(),
        "image": saved_url,
        "embedding": embedding,
        "ai_analysis": image_analysis,
        "contact_preference": contact_preference,
        **shared_coordinates,
        "created_at": now,
    }

    await db.pets.insert_one(new_pet)
    await _notify_nearby_lost_owners(db, new_pet, now)

    candidate_pets = await (await db.pets.find({"status": "Lost"})).to_list()
    ranked_matches = engine.rank_candidates(embedding, candidate_pets, exclude_id=pet_id)
    for match in ranked_matches:
        match_id = f"match-{uuid.uuid4().hex[:8]}"
        await db.matches.insert_one({
            "id": match_id,
            "lost_pet_id": match["pet_id"],
            "found_pet_id": pet_id,
            "similarity_score": match["similarity_score"],
            "similarity_percentage": match["similarity_percentage"],
            "confidence_badge": match["confidence_badge"],
            "match_status": "Potential Match",
            "created_at": now,
        })
        await _notify_match_owners(db, match["pet"], new_pet, match_id, now)
    safe_matches = []
    for match in ranked_matches:
        match_copy = match.copy()
        match_copy["pet"] = _public_pet(match_copy["pet"].copy())
        safe_matches.append(match_copy)

    return {
        "message": "Found pet photograph uploaded and indexed into the AI visual matching network.",
        "pet": _public_pet(new_pet.copy()),
        "matches": safe_matches,
        "total_matches": len(safe_matches),
    }


@router.get("/lost", response_model=List[PetResponse])
async def list_lost_pets(
    pet_type: Optional[str] = Query(None),
    breed: Optional[str] = Query(None),
    location: Optional[str] = Query(None),
) -> List[Any]:
    db = get_db()
    query: Dict[str, Any] = {"status": "Lost"}
    if pet_type and pet_type.lower() != "all":
        query["pet_type"] = pet_type
    
    pets = await (await db.pets.find(query)).to_list()
    pets = _filter_pets(pets, breed, location)
    enriched = [_public_pet(p) for p in pets]
    return enriched


@router.get("/found", response_model=List[PetResponse])
async def list_found_pets(
    pet_type: Optional[str] = Query(None),
    breed: Optional[str] = Query(None),
    location: Optional[str] = Query(None),
) -> List[Any]:
    db = get_db()
    query: Dict[str, Any] = {"status": "Found"}
    if pet_type and pet_type.lower() != "all":
        query["pet_type"] = pet_type
    
    pets = await (await db.pets.find(query)).to_list()
    pets = _filter_pets(pets, breed, location)
    enriched = [_public_pet(p) for p in pets]
    return enriched


@router.get("/all", response_model=List[PetResponse])
async def list_all_pets(
    status: Optional[str] = Query(None),
    pet_type: Optional[str] = Query(None),
    search: Optional[str] = Query(None),
) -> List[Any]:
    db = get_db()
    query: Dict[str, Any] = {}
    if status and status.lower() != "all":
        query["status"] = status
    if pet_type and pet_type.lower() != "all":
        query["pet_type"] = pet_type

    pets = await (await db.pets.find(query)).to_list()
    if search:
        s = search.lower()
        pets = [
            p for p in pets
            if s in (p.get("pet_name") or "").lower()
            or s in (p.get("breed") or "").lower()
            or s in (p.get("location") or "").lower()
            or s in (p.get("colour") or "").lower()
        ]

    enriched = [_public_pet(p) for p in pets]
    return enriched


@router.get("/user/my", response_model=List[PetResponse])
async def get_my_pets(current_user: Dict[str, Any] = Depends(get_current_user)) -> List[Any]:
    db = get_db()
    pets = await (await db.pets.find({"user_id": current_user["id"]})).to_list()
    enriched = [_public_pet(p) for p in pets]
    return enriched


@router.get("/{pet_id}", response_model=PetResponse)
async def get_pet_details(
    pet_id: str,
    current_user: Optional[Dict[str, Any]] = Depends(get_optional_user),
) -> Any:
    db = get_db()
    pet = await db.pets.find_one({"id": pet_id})
    if not pet:
        raise HTTPException(status_code=404, detail="Pet record not found")
    enriched = _public_pet(pet.copy())
    enriched["viewer_is_owner"] = bool(current_user and pet.get("user_id") == current_user["id"])
    return enriched


@router.put("/{pet_id}", response_model=PetResponse)
async def update_pet(
    pet_id: str,
    payload: PetUpdate,
    current_user: Dict[str, Any] = Depends(get_current_user),
) -> Any:
    db = get_db()
    pet = await db.pets.find_one({"id": pet_id})
    if not pet:
        raise HTTPException(status_code=404, detail="Pet record not found")

    is_admin = current_user.get("role") == "admin" or current_user.get("is_admin", False)
    if pet.get("user_id") != current_user["id"] and not is_admin:
        raise HTTPException(status_code=403, detail="Not authorized to edit this pet report")

    updates = {k: v for k, v in payload.model_dump(exclude_unset=True).items() if v is not None}
    if updates:
        await db.pets.update_one({"id": pet_id}, {"$set": updates})

    updated = await db.pets.find_one({"id": pet_id})
    enriched = _public_pet(updated)
    return enriched


@router.delete("/{pet_id}")
async def delete_pet(
    pet_id: str,
    current_user: Dict[str, Any] = Depends(get_current_user),
) -> Dict[str, str]:
    db = get_db()
    pet = await db.pets.find_one({"id": pet_id})
    if not pet:
        raise HTTPException(status_code=404, detail="Pet record not found")

    is_admin = current_user.get("role") == "admin" or current_user.get("is_admin", False)
    if pet.get("user_id") != current_user["id"] and not is_admin:
        raise HTTPException(status_code=403, detail="Not authorized to delete this pet report")

    await db.pets.delete_one({"id": pet_id})
    # Clean up associated matches
    await db.matches.delete_one({"lost_pet_id": pet_id})
    await db.matches.delete_one({"found_pet_id": pet_id})

    return {"message": "Pet record deleted successfully."}


@router.post("/visual-search")
async def visual_search_on_the_fly(
    image: UploadFile = File(...),
    status_filter: Optional[str] = Form(None),
    _current_user: Dict[str, Any] = Depends(get_current_user),
) -> Dict[str, Any]:
    """
    Allows any user to upload a photo and instantly search against all pets
    in the database using OpenCV preprocessing and OpenCLIP embeddings.
    """
    engine = _load_vision_engine()
    db = get_db()

    extension = os.path.splitext(image.filename or "")[1].lower()
    if extension not in ALLOWED_EXTENSIONS:
        raise HTTPException(status_code=415, detail="Upload a JPG, PNG, or WebP photograph.")
    file_bytes = await image.read(MAX_FILE_SIZE + 1)
    if len(file_bytes) > MAX_FILE_SIZE:
        raise HTTPException(status_code=413, detail="Image must be 10 MB or smaller.")
    query_embedding = engine.generate_embedding(file_bytes)

    query = {}
    if status_filter and status_filter.lower() != "all":
        query["status"] = status_filter

    candidate_pets = await (await db.pets.find(query)).to_list()
    ranked = engine.rank_candidates(query_embedding, candidate_pets)

    safe_matches = []
    for match in ranked:
        match_copy = match.copy()
        match_copy["pet"] = _public_pet(match_copy["pet"].copy())
        safe_matches.append(match_copy)

    return {
        "total_candidates_analyzed": len(candidate_pets),
        "total_matches": len(safe_matches),
        "matches": safe_matches,
    }


@router.get("/{pet_id}/image")
async def get_pet_image(
    pet_id: str,
    _current_user: Dict[str, Any] = Depends(get_current_user),
) -> FileResponse:
    db = get_db()
    pet = await db.pets.find_one({"id": pet_id})
    if not pet:
        raise HTTPException(status_code=404, detail="Pet record not found.")
    image = pet.get("image", "")
    filename = os.path.basename(image)
    if not image.startswith("/uploads/") or not filename:
        raise HTTPException(status_code=404, detail="Pet photograph not found.")
    upload_root = os.path.abspath(UPLOAD_DIR)
    image_path = os.path.abspath(os.path.join(upload_root, filename))
    if os.path.commonpath([upload_root, image_path]) != upload_root or not os.path.isfile(image_path):
        raise HTTPException(status_code=404, detail="Pet photograph not found.")
    media_type = MIME_TYPES.get(os.path.splitext(filename)[1].lower())
    if not media_type:
        raise HTTPException(status_code=415, detail="Pet photograph format is not supported.")
    return FileResponse(
        image_path,
        media_type=media_type,
        headers={"Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff"},
    )
