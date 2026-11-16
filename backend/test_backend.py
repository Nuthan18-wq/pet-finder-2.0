import asyncio
import os
import sys

# Add root directory to sys.path
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from backend.app.main import app, health_check, lifespan
from backend.app.database.connection import get_db


async def test_startup():
    async with lifespan(app):
        health = await health_check()
        assert health["status"] == "healthy"
        db = get_db()
        users = await (await db.users.find({})).to_list()
        pets = await (await db.pets.find({})).to_list()
        print(f"Startup succeeded. Existing accounts: {len(users)}; pet reports: {len(pets)}.")


if __name__ == "__main__":
    asyncio.run(test_startup())
