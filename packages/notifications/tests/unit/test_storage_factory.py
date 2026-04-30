from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from models.errors import StorageConnectionError, UnsupportedStorageError
from notifications.storage.factory import build_notifications_storage
from notifications.storage.memory import MemoryNotificationsStorage
from notifications.storage.postgres import PostgresNotificationsStorage

pytestmark = pytest.mark.asyncio


class TestBuildNotificationsStorage:
    async def test_none_url_returns_memory_storage(self):
        storage = await build_notifications_storage(None)
        assert isinstance(storage, MemoryNotificationsStorage)

    async def test_postgres_url_returns_postgres_storage(self):
        mock_pool = MagicMock()
        with (
            patch("notifications.storage.factory.run_migrations"),
            patch(
                "notifications.storage.factory.asyncpg.create_pool",
                new=AsyncMock(return_value=mock_pool),
            ),
        ):
            storage = await build_notifications_storage("postgresql://localhost/db")
        assert isinstance(storage, PostgresNotificationsStorage)

    async def test_postgres_url_runs_migrations(self):
        mock_pool = MagicMock()
        with (
            patch("notifications.storage.factory.run_migrations") as mock_migrate,
            patch(
                "notifications.storage.factory.asyncpg.create_pool",
                new=AsyncMock(return_value=mock_pool),
            ),
        ):
            await build_notifications_storage("postgresql://localhost/db")
        mock_migrate.assert_called_once_with("postgresql://localhost/db")

    async def test_unsupported_scheme_raises_unsupported_storage_error(self):
        with pytest.raises(UnsupportedStorageError):
            await build_notifications_storage("sqlite:///local.db")

    async def test_postgres_migration_failure_raises_storage_connection_error(self):
        with (
            patch(
                "notifications.storage.factory.run_migrations",
                side_effect=RuntimeError("migration failed"),
            ),
            pytest.raises(StorageConnectionError),
        ):
            await build_notifications_storage("postgresql://localhost/db")

    async def test_postgres_pool_failure_raises_storage_connection_error(self):
        with (
            patch("notifications.storage.factory.run_migrations"),
            patch(
                "notifications.storage.factory.asyncpg.create_pool",
                new=AsyncMock(side_effect=ConnectionError("unreachable")),
            ),
            pytest.raises(StorageConnectionError),
        ):
            await build_notifications_storage("postgresql://localhost/db")
