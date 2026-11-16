from __future__ import annotations

import json
import logging
import os
import uuid
from typing import Any, Dict, List, Optional

from motor.motor_asyncio import AsyncIOMotorClient
from pymongo import MongoClient
import pymongo

logger = logging.getLogger("pet_finder.db")

MONGODB_URI = os.getenv("MONGODB_URI", "mongodb://localhost:27017")
DATABASE_NAME = os.getenv("DATABASE_NAME", "pet_finder")
DATA_DIR = os.path.join(os.path.dirname(__file__), "..", "..", "data")
JSON_DB_PATH = os.path.join(DATA_DIR, "database.json")


class AsyncFileCollection:
    """Small async-compatible JSON collection for local development."""

    def __init__(self, db: "AsyncFileDatabase", name: str) -> None:
        self.db = db
        self.name = name

    def _matches(self, doc: Dict[str, Any], query: Dict[str, Any]) -> bool:
        for key, expected in query.items():
            if key == "$or" and isinstance(expected, list):
                if not any(self._matches(doc, item) for item in expected):
                    return False
                continue
            actual = doc.get(key)
            if isinstance(expected, dict):
                if "$in" in expected and actual not in expected["$in"]:
                    return False
                if "$ne" in expected and actual == expected["$ne"]:
                    return False
            elif actual != expected:
                return False
        return True

    async def find(
        self,
        query: Optional[Dict[str, Any]] = None,
        sort: Optional[List[tuple]] = None,
    ) -> "AsyncCursor":
        items = [doc for doc in self.db._data[self.name] if self._matches(doc, query or {})]
        if sort:
            for field, direction in reversed(sort):
                items.sort(
                    key=lambda doc: doc.get(field, ""),
                    reverse=direction == pymongo.DESCENDING or direction == -1,
                )
        return AsyncCursor(items)

    async def find_one(self, query: Dict[str, Any]) -> Optional[Dict[str, Any]]:
        for doc in self.db._data[self.name]:
            if self._matches(doc, query):
                return doc.copy()
        return None

    async def insert_one(self, document: Dict[str, Any]) -> Any:
        doc = document.copy()
        doc.setdefault("id", f"{self.name[:-1]}-{uuid.uuid4().hex[:8]}")
        doc.setdefault("_id", doc["id"])
        self.db._data[self.name].append(doc)
        await self.db.save()
        return type("InsertResult", (), {"inserted_id": doc["id"]})()

    async def update_one(self, query: Dict[str, Any], update: Dict[str, Any]) -> Any:
        for doc in self.db._data[self.name]:
            if self._matches(doc, query):
                for key, value in update.get("$set", {}).items():
                    doc[key] = value
                await self.db.save()
                return type("UpdateResult", (), {"matched_count": 1, "modified_count": 1})()
        return type("UpdateResult", (), {"matched_count": 0, "modified_count": 0})()

    async def delete_one(self, query: Dict[str, Any]) -> Any:
        for index, doc in enumerate(self.db._data[self.name]):
            if self._matches(doc, query):
                del self.db._data[self.name][index]
                await self.db.save()
                return type("DeleteResult", (), {"deleted_count": 1})()
        return type("DeleteResult", (), {"deleted_count": 0})()

    async def count_documents(self, query: Optional[Dict[str, Any]] = None) -> int:
        return sum(1 for doc in self.db._data[self.name] if self._matches(doc, query or {}))


class AsyncCursor:
    def __init__(self, items: List[Dict[str, Any]]) -> None:
        self.items = items

    async def to_list(self, length: Optional[int] = None) -> List[Dict[str, Any]]:
        selected = self.items if length is None else self.items[:length]
        return [doc.copy() for doc in selected]

    def __aiter__(self) -> "AsyncCursor":
        self._iter = iter(self.items)
        return self

    async def __anext__(self) -> Dict[str, Any]:
        try:
            return next(self._iter).copy()
        except StopIteration as exc:
            raise StopAsyncIteration from exc


class AsyncFileDatabase:
    def __init__(self, file_path: str) -> None:
        self.file_path = file_path
        self._data: Dict[str, List[Dict[str, Any]]] = {
            "users": [],
            "pets": [],
            "matches": [],
            "conversations": [],
            "messages": [],
            "reports": [],
            "organizations": [],
            "notifications": [],
            "reunions": [],
        }
        self.load()

    def load(self) -> None:
        os.makedirs(os.path.dirname(self.file_path), exist_ok=True)
        if not os.path.exists(self.file_path):
            return
        try:
            with open(self.file_path, "r", encoding="utf-8") as file:
                content = json.load(file)
            for collection, items in content.items():
                self._data[collection] = items
        except (OSError, json.JSONDecodeError) as exc:
            logger.exception("Could not load local JSON database at %s.", self.file_path)
            raise RuntimeError("The local JSON database could not be loaded.") from exc

    async def save(self) -> None:
        os.makedirs(os.path.dirname(self.file_path), exist_ok=True)
        try:
            with open(self.file_path, "w", encoding="utf-8") as file:
                json.dump(self._data, file, indent=2, ensure_ascii=False)
        except OSError as exc:
            logger.exception("Could not persist local JSON database at %s.", self.file_path)
            raise RuntimeError("The local JSON database could not be saved.") from exc

    def __getattr__(self, name: str) -> AsyncFileCollection:
        self._data.setdefault(name, [])
        return AsyncFileCollection(self, name)


class DatabaseProxy:
    def __init__(self) -> None:
        self._db: Any = None
        self._client: Optional[AsyncIOMotorClient] = None

    async def initialize(self) -> None:
        if self._db is not None:
            return
        try:
            probe = MongoClient(MONGODB_URI, serverSelectionTimeoutMS=1500)
            try:
                probe.admin.command("ping")
            finally:
                probe.close()
            client = AsyncIOMotorClient(MONGODB_URI)
            self._client = client
            self._db = client[DATABASE_NAME]
            logger.info("Connected to MongoDB database '%s'.", DATABASE_NAME)
        except Exception as exc:
            logger.warning("MongoDB is unavailable (%s); using the local JSON store.", exc)
            self._db = AsyncFileDatabase(JSON_DB_PATH)

    async def close(self) -> None:
        if self._client is not None:
            self._client.close()
            self._client = None
        self._db = None

    def __getattr__(self, name: str) -> Any:
        if self._db is None:
            raise RuntimeError("DatabaseProxy has not been initialized.")
        return getattr(self._db, name)


_db_proxy = DatabaseProxy()


async def init_db() -> DatabaseProxy:
    await _db_proxy.initialize()
    return _db_proxy


async def close_db() -> None:
    await _db_proxy.close()


def get_db() -> DatabaseProxy:
    return _db_proxy
