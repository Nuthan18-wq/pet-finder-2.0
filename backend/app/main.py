from __future__ import annotations

import logging
import os
from contextlib import asynccontextmanager
from typing import Dict

from dotenv import load_dotenv
from fastapi import FastAPI, WebSocket
from fastapi.middleware.cors import CORSMiddleware

# Load environment variables
load_dotenv(dotenv_path=os.path.join(os.path.dirname(__file__), "..", "..", ".env"))

from backend.app.database.connection import close_db, init_db
from backend.app.routes import (
    admin_routes,
    ai_routes,
    auth_routes,
    chat_routes,
    dashboard_routes,
    geo_routes,
    matches_routes,
    moderation_routes,
    notification_routes,
    pets_routes,
    poster_routes,
    reunion_routes,
    shelter_routes,
)

logger = logging.getLogger("pet_finder.main")
logging.basicConfig(level=logging.INFO)

@asynccontextmanager
async def lifespan(_app: FastAPI):
    logger.info("Initializing Pet-Finder database...")
    await init_db()
    logger.info("Pet-Finder API ready. AI models initialize when requested.")
    try:
        yield
    finally:
        await close_db()
        logger.info("Pet-Finder shutting down.")


app = FastAPI(
    title="Pet-Finder API",
    description="AI-Powered Lost and Found Pet Visual Search Network with OpenCLIP, Geolocation, and Gemini",
    version="2.5.0",
    lifespan=lifespan,
)

# CORS
origins = [
    origin.strip()
    for origin in os.getenv(
        "FRONTEND_ORIGINS",
        os.getenv(
            "ALLOWED_ORIGINS",
            "http://localhost:5173,http://127.0.0.1:5173",
        ),
    ).split(",")
    if origin.strip()
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Include Routers with /api prefix
app.include_router(auth_routes.router, prefix="/api")
app.include_router(pets_routes.router, prefix="/api")
app.include_router(matches_routes.router, prefix="/api")
app.include_router(chat_routes.router, prefix="/api")
app.include_router(admin_routes.router, prefix="/api")
app.include_router(ai_routes.router, prefix="/api")
app.include_router(geo_routes.router, prefix="/api")
app.include_router(notification_routes.router, prefix="/api")
app.include_router(poster_routes.router, prefix="/api")
app.include_router(shelter_routes.router, prefix="/api")
app.include_router(reunion_routes.router, prefix="/api")
app.include_router(moderation_routes.router, prefix="/api")
app.include_router(dashboard_routes.router, prefix="/api")


# Forward WebSocket /ws/chat/{conversation_id} to chat router implementation
@app.websocket("/ws/chat/{conversation_id}")
async def ws_chat_alias(websocket: WebSocket, conversation_id: str) -> None:
    await chat_routes.websocket_chat_endpoint(websocket, conversation_id)


@app.get("/api/health")
async def health_check() -> Dict[str, str]:
    return {
        "status": "healthy",
        "service": "Pet-Finder AI Visual Search Network",
        "engine": "OpenCLIP ViT-B-32 + Gemini AI Ecosystem",
    }


@app.get("/")
async def root() -> Dict[str, str]:
    return {
        "message": "Welcome to Pet-Finder AI Visual Search Network API",
        "docs": "/docs",
        "health": "/api/health",
    }


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("backend.app.main:app", host="0.0.0.0", port=8000, reload=True)
