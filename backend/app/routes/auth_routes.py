from __future__ import annotations

import uuid
from datetime import datetime, timezone
from typing import Any, Dict

from fastapi import APIRouter, Depends, HTTPException, status

from backend.app.authentication.auth import (
    create_access_token,
    get_current_user,
    hash_password,
    verify_password,
)
from backend.app.database.connection import get_db
from backend.app.models.schemas import (
    ForgotPasswordRequest,
    TokenResponse,
    UserLogin,
    UserProfileUpdate,
    UserRegister,
    UserResponse,
)

router = APIRouter(prefix="/auth", tags=["Authentication"])


@router.post("/register", response_model=TokenResponse)
async def register(payload: UserRegister) -> Dict[str, Any]:
    db = get_db()
    existing_user = await db.users.find_one({"email": payload.email.lower()})
    if existing_user:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="An account with this email address already exists.",
        )

    now = datetime.now(timezone.utc).isoformat()
    user_id = f"user-{uuid.uuid4().hex[:8]}"
    new_user = {
        "id": user_id,
        "full_name": payload.full_name.strip(),
        "email": payload.email.lower().strip(),
        "password_hash": hash_password(payload.password),
        "phone": payload.phone or "",
        "profile_image": payload.profile_image or "",
        "role": "user",
        "created_at": now,
    }

    await db.users.insert_one(new_user)
    token = create_access_token({"sub": user_id, "email": new_user["email"], "role": new_user["role"]})

    return {
        "access_token": token,
        "token_type": "bearer",
        "user": UserResponse(**new_user),
    }


@router.post("/login", response_model=TokenResponse)
async def login(payload: UserLogin) -> Dict[str, Any]:
    db = get_db()
    user = await db.users.find_one({"email": payload.email.lower().strip()})
    if not user or not verify_password(payload.password, user.get("password_hash", "")):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid email or password.",
        )

    token = create_access_token({"sub": user["id"], "email": user["email"], "role": user.get("role", "user")})

    return {
        "access_token": token,
        "token_type": "bearer",
        "user": UserResponse(**user),
    }


@router.get("/me", response_model=UserResponse)
async def get_me(current_user: Dict[str, Any] = Depends(get_current_user)) -> Any:
    return UserResponse(**current_user)


@router.put("/profile", response_model=UserResponse)
async def update_profile(
    payload: UserProfileUpdate,
    current_user: Dict[str, Any] = Depends(get_current_user),
) -> Any:
    db = get_db()
    updates: Dict[str, Any] = {}
    if payload.full_name is not None:
        updates["full_name"] = payload.full_name.strip()
    if payload.phone is not None:
        updates["phone"] = payload.phone.strip()
    if payload.profile_image is not None:
        updates["profile_image"] = payload.profile_image

    if updates:
        await db.users.update_one({"id": current_user["id"]}, {"$set": updates})
        updated_user = await db.users.find_one({"id": current_user["id"]})
        return UserResponse(**updated_user)

    return UserResponse(**current_user)


@router.post("/forgot-password")
async def forgot_password(payload: ForgotPasswordRequest) -> Dict[str, str]:
    db = get_db()
    user = await db.users.find_one({"email": payload.email.lower().strip()})
    # Do not leak whether email exists in response for security
    return {
        "message": "If this email is registered in our network, password reset instructions have been dispatched."
    }
