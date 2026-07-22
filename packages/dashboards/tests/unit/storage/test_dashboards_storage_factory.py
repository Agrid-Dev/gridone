"""Unit tests for dashboards.storage.factory."""

from __future__ import annotations

import pytest
from dashboards.storage.factory import build_storage
from dashboards.storage.memory import MemoryStorage
from dashboards.widgets import build_default_registry

from models.errors import StorageConnectionError, UnsupportedStorageError

pytestmark = pytest.mark.asyncio


async def test_memory_backend_when_url_is_none():
    storage = await build_storage(None, build_default_registry())

    assert isinstance(storage, MemoryStorage)
    await storage.close()


async def test_unsupported_scheme_raises():
    with pytest.raises(UnsupportedStorageError, match="redis"):
        await build_storage("redis://nope", build_default_registry())


async def test_postgres_failure_wrapped(monkeypatch: pytest.MonkeyPatch):
    async def fake_build(_url: str, _registry):  # noqa: ANN202
        msg = "connection refused"
        raise RuntimeError(msg)

    monkeypatch.setattr(
        "dashboards.storage.postgres.build_postgres_storage", fake_build
    )
    with pytest.raises(StorageConnectionError):
        await build_storage("postgresql://invalid", build_default_registry())
