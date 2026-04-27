from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from notifications.storage.factory import build_notifications_storage
from notifications.storage.postgres import PostgresNotificationsStorage

pytestmark = pytest.mark.asyncio


class TestBuildNotificationsStorage:
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

    async def test_unsupported_scheme_raises_value_error(self):
        with pytest.raises(ValueError, match="Unsupported storage URL scheme"):
            await build_notifications_storage("sqlite:///local.db")
