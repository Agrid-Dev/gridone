from unittest.mock import AsyncMock

import pytest

from documents.storage import build_storage
from documents.storage.memory import MemoryStorage
from models.errors import StorageConnectionError, UnsupportedStorageError

pytestmark = pytest.mark.asyncio


async def test_memory():
    assert isinstance(await build_storage(None), MemoryStorage)


async def test_unsupported():
    with pytest.raises(UnsupportedStorageError):
        await build_storage("redis://host")


async def test_postgres_connection_errors_are_wrapped(monkeypatch):
    monkeypatch.setattr(
        "documents.storage.postgres.build_postgres_storage",
        AsyncMock(side_effect=RuntimeError("private connection details")),
    )
    with pytest.raises(
        StorageConnectionError, match="Failed to initialize documents storage"
    ):
        await build_storage("postgresql://localhost/test")
