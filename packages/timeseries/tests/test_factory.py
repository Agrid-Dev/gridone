from __future__ import annotations

import asyncpg
import pytest

from models.errors import StorageConnectionError, UnsupportedStorageError
from timeseries import TimeSeriesService
from timeseries.storage import MemoryStorage, build_storage

pytestmark = pytest.mark.asyncio


class TestBuildStorage:
    async def test_none_returns_memory(self):
        storage = await build_storage(None)
        assert isinstance(storage, MemoryStorage)

    async def test_default_returns_memory(self):
        storage = await build_storage()
        assert isinstance(storage, MemoryStorage)

    async def test_unsupported_url_raises(self):
        with pytest.raises(UnsupportedStorageError, match="Unsupported"):
            await build_storage("unsupported://localhost")

    async def test_postgres_connection_failure_raises_storage_error(self, monkeypatch):
        async def fail_create_pool(*_args: object, **_kwargs: object) -> None:
            raise OSError("offline")

        monkeypatch.setattr(asyncpg, "create_pool", fail_create_pool)

        with pytest.raises(
            StorageConnectionError,
            match="Failed to initialize timeseries postgres backend",
        ):
            await build_storage("postgresql://localhost/gridone")


class TestTimeSeriesServiceLifecycle:
    async def test_start_uses_memory(self):
        service = TimeSeriesService(storage_url=None)
        await service.start()
        try:
            # Memory storage answers list_series without a DB; this exercises
            # the freshly-built backend without poking at private state.
            assert await service.list_series() == []
            assert service.is_started
        finally:
            await service.stop()

    async def test_stop_closes_memory_storage(self):
        service = TimeSeriesService(storage_url=None)
        await service.start()
        await service.stop()
        assert not service.is_started

    async def test_methods_require_start(self):
        service = TimeSeriesService(storage_url=None)
        assert isinstance(service, TimeSeriesService)
        with pytest.raises(RuntimeError, match="must be called before use"):
            await service.list_series()

    async def test_postgres_start_runs_migrations_and_hypertable(self, monkeypatch):
        calls: list[object] = []
        url = "postgresql://localhost/gridone"

        class FakeStorage(MemoryStorage):
            async def try_enable_hypertable(self) -> None:
                calls.append("hypertable")

        def fake_run_migrations(database_url: str) -> None:
            calls.append(("migrations", database_url))

        async def fake_build_storage(database_url: str | None = None) -> FakeStorage:
            calls.append(("build", database_url))
            return FakeStorage()

        monkeypatch.setattr(
            "timeseries.storage.postgres.run_migrations",
            fake_run_migrations,
        )
        monkeypatch.setattr(
            "timeseries.service.service.build_storage",
            fake_build_storage,
        )

        service = TimeSeriesService(storage_url=url)
        await service.start()
        try:
            assert calls == [
                ("migrations", url),
                ("build", url),
                "hypertable",
            ]
        finally:
            await service.stop()
