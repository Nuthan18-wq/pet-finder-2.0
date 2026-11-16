from __future__ import annotations

from datetime import datetime
from typing import Any, Dict, List, Literal, Optional
from pydantic import BaseModel, Field


# ==================== User Schemas ====================

class UserRegister(BaseModel):
    full_name: str = Field(..., min_length=2, max_length=80)
    email: str = Field(..., min_length=4)
    password: str = Field(..., min_length=6)
    phone: Optional[str] = None
    profile_image: Optional[str] = None


class UserLogin(BaseModel):
    email: str = Field(..., min_length=4)
    password: str


class UserProfileUpdate(BaseModel):
    full_name: Optional[str] = None
    phone: Optional[str] = None
    profile_image: Optional[str] = None


class ForgotPasswordRequest(BaseModel):
    email: str



class UserResponse(BaseModel):
    id: str
    full_name: str
    email: str
    phone: Optional[str] = None
    profile_image: Optional[str] = None
    role: str = "user"
    created_at: str

    model_config = {"from_attributes": True}


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: UserResponse


# ==================== Pet Schemas ====================

PetStatusType = Literal["Lost", "Found", "Potential Match", "Reunited", "Closed"]
PetSpeciesType = Literal["Dog", "Cat", "Other"]


class PetCreate(BaseModel):
    pet_name: Optional[str] = Field(None, alias="petName")
    pet_type: PetSpeciesType = Field("Dog", alias="petType")
    breed: Optional[str] = None
    colour: Optional[str] = None
    gender: Optional[str] = None
    age: Optional[str] = None
    location: str
    date: Optional[str] = None
    description: Optional[str] = None
    contact_preference: Optional[str] = Field("In-App Secure Chat", alias="contactPreference")
    image: Optional[str] = None  # Base64 or URL

    model_config = {"populate_by_name": True}


class PetUpdate(BaseModel):
    pet_name: Optional[str] = None
    pet_type: Optional[PetSpeciesType] = None
    breed: Optional[str] = None
    colour: Optional[str] = None
    gender: Optional[str] = None
    age: Optional[str] = None
    location: Optional[str] = None
    date: Optional[str] = None
    description: Optional[str] = None
    status: Optional[PetStatusType] = None
    contact_preference: Optional[str] = None


class PetResponse(BaseModel):
    id: str
    user_id: Optional[str] = None
    pet_name: Optional[str] = "Unknown"
    pet_type: str
    breed: Optional[str] = "Unknown"
    colour: Optional[str] = "Unknown"
    gender: Optional[str] = None
    age: Optional[str] = None
    location: str
    date: str
    status: PetStatusType
    description: Optional[str] = ""
    image: str
    contact_preference: Optional[str] = "In-App Secure Chat"
    created_at: str
    owner_name: Optional[str] = None
    ai_analysis: Optional[Dict[str, Any]] = None
    latitude: Optional[float] = None
    longitude: Optional[float] = None
    location_shared: bool = False
    viewer_is_owner: bool = False

    model_config = {"from_attributes": True}


# ==================== Match Schemas ====================

class MatchItem(BaseModel):
    id: str
    lost_pet_id: str
    found_pet_id: str
    similarity_score: float
    similarity_percentage: float
    confidence_badge: str
    disclaimer: str
    distance_km: Optional[float] = None
    date_difference_days: Optional[int] = None
    matching_characteristics: List[Dict[str, str]] = Field(default_factory=list)
    found_pet: Dict[str, Any]
    lost_pet: Optional[Dict[str, Any]] = None
    created_at: str


class MatchSearchResponse(BaseModel):
    lost_pet: Dict[str, Any]
    total_matches: int
    matches: List[MatchItem]


class MatchReportCreate(BaseModel):
    reason: str
    details: Optional[str] = None


# ==================== Chat Schemas ====================

class ConversationCreate(BaseModel):
    recipient_id: str
    pet_id: Optional[str] = None
    match_id: Optional[str] = None
    lost_pet_id: Optional[str] = None
    found_pet_id: Optional[str] = None


class ChatMessageSchema(BaseModel):
    id: str
    conversation_id: str
    sender_id: str
    sender_name: Optional[str] = None
    sender_image: Optional[str] = None
    message: str
    attachment: Optional[str] = None
    timestamp: str
    read_status: bool = False


class ChatSendPayload(BaseModel):
    message: str = Field(default="", max_length=5000)
    attachment: Optional[str] = None


class ConversationResponse(BaseModel):
    id: str
    participants: List[str]
    participant_details: List[Dict[str, Any]]
    pet_id: Optional[str] = None
    pet_details: Optional[Dict[str, Any]] = None
    match_id: Optional[str] = None
    last_message: Optional[ChatMessageSchema] = None
    unread_count: int = 0
    updated_at: str


# ==================== Admin Schemas ====================

class AdminDashboardStats(BaseModel):
    total_users: int
    total_lost_reports: int
    total_found_reports: int
    potential_ai_matches: int
    reunited_pets: int
    closed_cases: int
