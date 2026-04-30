"""Unit tests for automations.storage.factory."""

from __future__ import annotations

import pytest
from automations.storage.factory import build_storage
from automations.storage.memory import MemoryAutomationsStorage

from models.errors import StorageConnectionError, UnsupportedStorageError

pytestmark = pytest.mark.asyncio


async def test_memory_backend_when_url_is_none():
    storage = await build_storage(None)
    assert isinstance(storage, MemoryAutomationsStorage)
    await storage.close()


async def test_unsupported_scheme_raises():
    with pytest.raises(UnsupportedStorageError, match="redis"):
        await build_storage("redis://nope")


async def test_postgres_failure_wrapped(monkeypatch: pytest.MonkeyPatch):
    async def fake_from_url(_url: str):  # noqa: ANN202
        msg = "connection refused"
        raise RuntimeError(msg)

    monkeypatch.setattr(
        "automations.storage.postgres.PostgresStorage.from_url",
        fake_from_url,
    )
    with pytest.raises(StorageConnectionError):
        await build_storage("postgresql://invalid")
