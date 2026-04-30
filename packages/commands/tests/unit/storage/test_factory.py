"""Unit tests for commands.storage.factory."""

import pytest

from commands.storage.factory import build_storage
from commands.storage.memory import MemoryStorage
from models.errors import StorageConnectionError, UnsupportedStorageError

pytestmark = pytest.mark.asyncio


async def test_memory_backend_when_url_is_none():
    storage = await build_storage(None)
    assert isinstance(storage, MemoryStorage)
    await storage.close()


async def test_unsupported_scheme_raises():
    with pytest.raises(UnsupportedStorageError, match="redis"):
        await build_storage("redis://nope")


async def test_postgres_failure_wrapped(monkeypatch: pytest.MonkeyPatch):
    async def fake_build(_url: str):  # noqa: ANN202
        msg = "connection refused"
        raise RuntimeError(msg)

    monkeypatch.setattr("commands.storage.postgres.build_postgres_storage", fake_build)
    with pytest.raises(StorageConnectionError):
        await build_storage("postgresql://invalid")
