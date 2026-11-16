from __future__ import annotations

import json
import logging
import os
import uuid
from datetime import datetime, timezone
from typing import Any, Dict, List

from fastapi import (
    APIRouter,
    Depends,
    File,
    HTTPException,
    Query,
    UploadFile,
    WebSocket,
    WebSocketDisconnect,
    status,
)
from fastapi.responses import FileResponse

from backend.app.ai.embedding_engine import cosine_similarity
from backend.app.authentication.auth import decode_access_token, get_current_user
from backend.app.database.connection import get_db
from backend.app.models.schemas import ChatSendPayload, ConversationCreate

router = APIRouter(prefix="/chat", tags=["Real-Time Secure Chat"])
logger = logging.getLogger("pet_finder.chat")
UPLOAD_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", "uploads"))
CHAT_IMAGE_EXTENSIONS = {".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".png": "image/png", ".webp": "image/webp"}
MAX_ATTACHMENT_SIZE = 10 * 1024 * 1024


async def _notify_message_recipient(
    db: Any,
    conversation: Dict[str, Any],
    sender_id: str,
    sender_name: str,
    conversation_id: str,
    created_at: str,
) -> None:
    for participant_id in conversation.get("participants", []):
        if participant_id == sender_id:
            continue
        recipient = await db.users.find_one({"id": participant_id})
        if (recipient or {}).get("notification_preferences", {}).get("message_alerts", True) is False:
            continue
        await db.notifications.insert_one({
            "id": f"note-{uuid.uuid4().hex[:8]}",
            "user_id": participant_id,
            "type": "new_message",
            "title": "New secure message",
            "message": f"{sender_name} sent you a message.",
            "conversation_id": conversation_id,
            "created_at": created_at,
            "read_status": False,
        })


def _validate_chat_attachment(attachment: str, conversation_id: str) -> str:
    filename = os.path.basename(attachment.split("?", 1)[0].rstrip("/"))
    if not filename.startswith(f"chat_{conversation_id}_"):
        raise HTTPException(status_code=400, detail="Invalid chat attachment.")
    extension = os.path.splitext(filename)[1].lower()
    if extension not in CHAT_IMAGE_EXTENSIONS:
        raise HTTPException(status_code=415, detail="Unsupported chat attachment.")
    upload_root = os.path.abspath(UPLOAD_DIR)
    path = os.path.abspath(os.path.join(upload_root, filename))
    if os.path.commonpath([upload_root, path]) != upload_root or not os.path.isfile(path):
        raise HTTPException(status_code=404, detail="Chat attachment not found.")
    return path


class ConnectionManager:
    """
    Manages active WebSocket connections per conversation room.
    """
    def __init__(self) -> None:
        self.active_connections: Dict[str, List[WebSocket]] = {}

    async def connect(self, websocket: WebSocket, conversation_id: str) -> None:
        await websocket.accept()
        if conversation_id not in self.active_connections:
            self.active_connections[conversation_id] = []
        self.active_connections[conversation_id].append(websocket)
        logger.info(f"WebSocket client connected to room {conversation_id}. Total: {len(self.active_connections[conversation_id])}")

    def disconnect(self, websocket: WebSocket, conversation_id: str) -> None:
        if conversation_id in self.active_connections:
            if websocket in self.active_connections[conversation_id]:
                self.active_connections[conversation_id].remove(websocket)
            if not self.active_connections[conversation_id]:
                del self.active_connections[conversation_id]
        logger.info(f"WebSocket client disconnected from room {conversation_id}.")

    async def broadcast_to_room(self, conversation_id: str, message: Dict[str, Any]) -> None:
        if conversation_id in self.active_connections:
            for connection in list(self.active_connections[conversation_id]):
                try:
                    await connection.send_json(message)
                except Exception as e:
                    logger.warning(f"Error broadcasting message to socket: {e}")
                    self.disconnect(connection, conversation_id)


manager = ConnectionManager()


@router.get("/conversations")
async def list_conversations(current_user: Dict[str, Any] = Depends(get_current_user)) -> List[Dict[str, Any]]:
    db = get_db()
    user_id = current_user["id"]
    
    # Find conversations where current user is a participant
    all_convos = await (await db.conversations.find({})).to_list()
    user_convos = [c for c in all_convos if user_id in c.get("participants", [])]

    results = []
    for c in user_convos:
        c_id = c["id"]
        # Fetch participants info
        participants = []
        for p_id in c.get("participants", []):
            u = await db.users.find_one({"id": p_id})
            if u:
                participants.append({
                    "id": u["id"],
                    "full_name": u.get("full_name", "User"),
                    "profile_image": u.get("profile_image", ""),
                })
        
        # Pet info
        pet_info = None
        if c.get("pet_id"):
            pet = await db.pets.find_one({"id": c["pet_id"]})
            if pet:
                pet_info = {
                    "id": pet["id"],
                    "pet_name": pet.get("pet_name"),
                    "pet_type": pet.get("pet_type"),
                    "image": f"/api/pets/{pet['id']}/image",
                    "status": pet.get("status"),
                }

        # Last message
        messages = await (await db.messages.find({"conversation_id": c_id})).to_list()
        messages.sort(key=lambda message: message.get("timestamp", ""))
        last_msg = messages[-1].copy() if messages else None
        if last_msg:
            last_msg.pop("_id", None)
        unread = sum(1 for m in messages if m.get("sender_id") != user_id and not m.get("read_status", False))

        results.append({
            "id": c_id,
            "participants": c.get("participants", []),
            "participant_details": participants,
            "pet_id": c.get("pet_id"),
            "pet_details": pet_info,
            "match_id": c.get("match_id"),
            "last_message": last_msg,
            "unread_count": unread,
            "updated_at": c.get("updated_at", c.get("created_at", "")),
        })

    # Sort most recent first
    results.sort(key=lambda x: x.get("updated_at", ""), reverse=True)
    return results


@router.post("/conversations")
async def get_or_create_conversation(
    payload: ConversationCreate,
    current_user: Dict[str, Any] = Depends(get_current_user),
) -> Dict[str, Any]:
    db = get_db()
    user_id = current_user["id"]
    recipient_id = payload.recipient_id

    if user_id == recipient_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Cannot start a private conversation with yourself.",
        )
    recipient = await db.users.find_one({"id": recipient_id})
    if not recipient:
        raise HTTPException(status_code=404, detail="Recipient user not found.")

    if not payload.lost_pet_id or not payload.found_pet_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="A potential match must be selected to start a private chat.",
        )
    lost_pet = await db.pets.find_one({"id": payload.lost_pet_id, "status": "Lost"})
    found_pet = await db.pets.find_one({"id": payload.found_pet_id, "status": "Found"})
    if not lost_pet or not found_pet:
        raise HTTPException(status_code=404, detail="The potential match reports could not be found.")
    if {lost_pet.get("user_id"), found_pet.get("user_id")} != {user_id, recipient_id}:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only the owner and finder of these reports can start this conversation.",
        )
    lost_embedding = lost_pet.get("embedding")
    found_embedding = found_pet.get("embedding")
    if (
        not isinstance(lost_embedding, list)
        or not isinstance(found_embedding, list)
        or not lost_embedding
        or not found_embedding
        or len(lost_embedding) != len(found_embedding)
        or cosine_similarity(lost_embedding, found_embedding) < 0.20
    ):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="These reports do not have a qualifying visual match for a private conversation.",
        )

    # Check if conversation already exists between these two users
    all_convos = await (await db.conversations.find({})).to_list()
    existing = None
    for c in all_convos:
        parts = c.get("participants", [])
        if user_id in parts and recipient_id in parts:
            if (
                payload.pet_id
                and c.get("pet_id") == payload.pet_id
                and c.get("lost_pet_id") == payload.lost_pet_id
                and c.get("found_pet_id") == payload.found_pet_id
            ):
                existing = c
                break
            elif not payload.pet_id and c.get("lost_pet_id") == payload.lost_pet_id and c.get("found_pet_id") == payload.found_pet_id:
                existing = c
                break

    now = datetime.now(timezone.utc).isoformat()
    if existing:
        safe_conversation = existing.copy()
        safe_conversation.pop("_id", None)
        return {"conversation": safe_conversation, "is_new": False}

    convo_id = f"convo-{uuid.uuid4().hex[:10]}"
    new_convo = {
        "id": convo_id,
        "participants": [user_id, recipient_id],
        "pet_id": payload.pet_id,
        "match_id": payload.match_id,
        "lost_pet_id": payload.lost_pet_id,
        "found_pet_id": payload.found_pet_id,
        "created_at": now,
        "updated_at": now,
    }
    await db.conversations.insert_one(new_convo)

    return {"conversation": new_convo, "is_new": True}


@router.get("/messages/{conversation_id}")
async def get_messages(
    conversation_id: str,
    current_user: Dict[str, Any] = Depends(get_current_user),
) -> Dict[str, Any]:
    db = get_db()
    convo = await db.conversations.find_one({"id": conversation_id})
    if not convo:
        raise HTTPException(status_code=404, detail="Conversation not found.")

    if current_user["id"] not in convo.get("participants", []):
        raise HTTPException(status_code=403, detail="Unauthorized to view this private chat room.")

    messages = await (await db.messages.find({"conversation_id": conversation_id})).to_list()
    
    # Mark messages sent to current_user as read
    for m in messages:
        if m.get("sender_id") != current_user["id"] and not m.get("read_status", False):
            await db.messages.update_one({"id": m["id"]}, {"$set": {"read_status": True}})
            m["read_status"] = True
    notifications = await (await db.notifications.find({
        "user_id": current_user["id"],
        "conversation_id": conversation_id,
        "read_status": False,
    })).to_list()
    for notification in notifications:
        await db.notifications.update_one({"id": notification["id"]}, {"$set": {"read_status": True}})

    # Enrich messages with sender details
    enriched_messages = []
    for m in messages:
        sender = await db.users.find_one({"id": m.get("sender_id")})
        m_copy = m.copy()
        m_copy.pop("_id", None)
        if sender:
            m_copy["sender_name"] = sender.get("full_name")
            m_copy["sender_image"] = sender.get("profile_image")
        enriched_messages.append(m_copy)

    return {
        "conversation_id": conversation_id,
        "messages": enriched_messages,
    }


@router.post("/messages/{conversation_id}")
async def send_rest_message(
    conversation_id: str,
    payload: ChatSendPayload,
    current_user: Dict[str, Any] = Depends(get_current_user),
) -> Dict[str, Any]:
    db = get_db()
    convo = await db.conversations.find_one({"id": conversation_id})
    if not convo:
        raise HTTPException(status_code=404, detail="Conversation not found.")

    if current_user["id"] not in convo.get("participants", []):
        raise HTTPException(status_code=403, detail="Unauthorized to post in this room.")

    text = payload.message.strip()
    attachment = payload.attachment
    if not text and not attachment:
        raise HTTPException(status_code=400, detail="Cannot send an empty message.")
    if attachment:
        _validate_chat_attachment(attachment, conversation_id)

    now = datetime.now(timezone.utc).isoformat()
    msg_id = f"msg-{uuid.uuid4().hex[:8]}"
    new_message = {
        "id": msg_id,
        "conversation_id": conversation_id,
        "sender_id": current_user["id"],
        "sender_name": current_user.get("full_name"),
        "sender_image": current_user.get("profile_image"),
        "message": text,
        "attachment": attachment,
        "timestamp": now,
        "read_status": False,
    }

    await db.messages.insert_one(new_message)
    await db.conversations.update_one({"id": conversation_id}, {"$set": {"updated_at": now}})
    await _notify_message_recipient(
        db, convo, current_user["id"], current_user.get("full_name", "A pet guardian"),
        conversation_id, now,
    )

    # Broadcast via active WebSocket
    await manager.broadcast_to_room(conversation_id, {
        "type": "new_message",
        "conversation_id": conversation_id,
        "message": new_message,
    })

    return {"message": new_message}


@router.post("/attachments/{conversation_id}")
async def upload_chat_attachment(
    conversation_id: str,
    image: UploadFile = File(...),
    current_user: Dict[str, Any] = Depends(get_current_user),
) -> Dict[str, str]:
    db = get_db()
    conversation = await db.conversations.find_one({"id": conversation_id})
    if not conversation:
        raise HTTPException(status_code=404, detail="Conversation not found.")
    if current_user["id"] not in conversation.get("participants", []):
        raise HTTPException(status_code=403, detail="Only conversation participants can upload attachments.")
    extension = os.path.splitext(image.filename or "")[1].lower()
    if extension not in CHAT_IMAGE_EXTENSIONS:
        raise HTTPException(status_code=415, detail="Upload a JPG, PNG, or WebP image.")
    image_bytes = await image.read(MAX_ATTACHMENT_SIZE + 1)
    if len(image_bytes) > MAX_ATTACHMENT_SIZE:
        raise HTTPException(status_code=413, detail="Chat images must be 10MB or smaller.")
    filename = f"chat_{conversation_id}_{uuid.uuid4().hex[:12]}{extension}"
    os.makedirs(UPLOAD_DIR, exist_ok=True)
    with open(os.path.join(UPLOAD_DIR, filename), "wb") as file:
        file.write(image_bytes)
    return {"attachment": f"/api/chat/attachments/{filename}?conversation_id={conversation_id}"}


@router.get("/attachments/{filename}")
async def get_chat_attachment(
    filename: str,
    conversation_id: str = Query(...),
    current_user: Dict[str, Any] = Depends(get_current_user),
) -> FileResponse:
    db = get_db()
    conversation = await db.conversations.find_one({"id": conversation_id})
    if not conversation:
        raise HTTPException(status_code=404, detail="Conversation not found.")
    if current_user["id"] not in conversation.get("participants", []):
        raise HTTPException(status_code=403, detail="Only conversation participants can view attachments.")
    path = _validate_chat_attachment(filename, conversation_id)
    media_type = CHAT_IMAGE_EXTENSIONS[os.path.splitext(filename)[1].lower()]
    return FileResponse(
        path,
        media_type=media_type,
        headers={"Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff"},
    )


# ==================== Real-Time WebSocket ====================

@router.websocket("/ws/{conversation_id}")
async def websocket_chat_endpoint(websocket: WebSocket, conversation_id: str) -> None:
    """
    WebSocket endpoint for instant bidirectional chat.
    Validates token from query parameters: /ws/{conversation_id}?token=...
    """
    token = websocket.query_params.get("token")
    if not token:
        await websocket.close(code=status.WS_1008_POLICY_VIOLATION)
        return

    try:
        payload = decode_access_token(token)
        user_id = payload.get("sub")
    except Exception:
        await websocket.close(code=status.WS_1008_POLICY_VIOLATION)
        return

    if not isinstance(user_id, str) or not user_id:
        await websocket.close(code=status.WS_1008_POLICY_VIOLATION)
        return

    db = get_db()
    convo = await db.conversations.find_one({"id": conversation_id})
    if not convo or user_id not in convo.get("participants", []):
        await websocket.close(code=status.WS_1008_POLICY_VIOLATION)
        return

    user = await db.users.find_one({"id": user_id})
    user_name = user.get("full_name", "User") if user else "User"
    user_image = user.get("profile_image", "") if user else ""

    await manager.connect(websocket, conversation_id)
    try:
        while True:
            data = await websocket.receive_text()
            try:
                parsed = json.loads(data)
                if not isinstance(parsed, dict):
                    await websocket.send_json({"type": "error", "message": "A message object is required."})
                    continue
                raw_text = parsed.get("message", "")
                attachment = parsed.get("attachment")
                if not isinstance(raw_text, str) or (attachment is not None and not isinstance(attachment, str)):
                    await websocket.send_json({"type": "error", "message": "Message text and attachment must be strings."})
                    continue
                text = raw_text.strip()
                if len(text) > 5000:
                    await websocket.send_json({"type": "error", "message": "Messages must be 5,000 characters or fewer."})
                    continue
                if not text and not attachment:
                    continue
                if attachment:
                    try:
                        _validate_chat_attachment(attachment, conversation_id)
                    except HTTPException as exc:
                        await websocket.send_json({"type": "error", "message": str(exc.detail)})
                        continue

                now = datetime.now(timezone.utc).isoformat()
                msg_id = f"msg-{uuid.uuid4().hex[:8]}"
                msg_obj = {
                    "id": msg_id,
                    "conversation_id": conversation_id,
                    "sender_id": user_id,
                    "sender_name": user_name,
                    "sender_image": user_image,
                    "message": text,
                    "attachment": attachment,
                    "timestamp": now,
                    "read_status": False,
                }

                await db.messages.insert_one(msg_obj)
                await db.conversations.update_one({"id": conversation_id}, {"$set": {"updated_at": now}})
                await _notify_message_recipient(
                    db, convo, user_id, user_name, conversation_id, now,
                )

                # Broadcast to all connected sockets in this conversation room
                await manager.broadcast_to_room(conversation_id, {
                    "type": "new_message",
                    "conversation_id": conversation_id,
                    "message": msg_obj,
                })
            except json.JSONDecodeError:
                await websocket.send_json({"type": "error", "message": "Messages must be valid JSON."})
    except WebSocketDisconnect:
        manager.disconnect(websocket, conversation_id)
