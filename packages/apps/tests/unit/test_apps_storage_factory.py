"""Unit tests for apps.storage.factory."""

import pytest

from apps.storage.factory import AppsStorages, build_apps_storages
from apps.storage.memory import MemoryAppStorage, MemoryRegistrationStorage
from models.errors import StorageConnectionError, UnsupportedStorageError

pytestmark = pytest.mark.asyncio


async def test_memory_backend_when_url_is_none():
    storages = await build_apps_storages(None)
    assert isinstance(storages, AppsStorages)
    assert isinstance(storages.registration, MemoryRegistrationStorage)
    assert isinstance(storages.apps, MemoryAppStorage)
    await storages.close()


async def test_unsupported_scheme_raises():
    with pytest.raises(UnsupportedStorageError, match="redis"):
        await build_apps_storages("redis://nope")


async def test_postgres_failure_wrapped(monkeypatch):
    async def fake_build(_url: str):  # noqa: ANN202
        msg = "connection refused"
        raise RuntimeError(msg)

    monkeypatch.setattr("apps.storage.postgres.build", fake_build)
    with pytest.raises(StorageConnectionError):
        await build_apps_storages("postgresql://invalid")


async def test_postgres_success_returns_storages(monkeypatch):
    sentinel = AppsStorages(
        registration=MemoryRegistrationStorage(),
        apps=MemoryAppStorage(),
    )

    async def fake_build(_url: str) -> AppsStorages:
        return sentinel

    monkeypatch.setattr("apps.storage.postgres.build", fake_build)
    storages = await build_apps_storages("postgresql://fake")
    assert storages is sentinel
