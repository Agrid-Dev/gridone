from unittest.mock import AsyncMock, patch

import pytest

from device_views import DeviceViewsService
from device_views.storage.protocol import ViewStorage
from models.errors import StorageConnectionError, StorageNotInitializedError


@pytest.mark.asyncio
@pytest.mark.parametrize("scheme", ["postgresql", "postgresql+asyncpg"])
async def test_failed_start_can_be_retried_without_exposing_backend_errors(scheme):
    storage = AsyncMock(spec=ViewStorage)
    failure = OSError("backend connection details")
    service = DeviceViewsService(f"{scheme}://localhost/test")

    with patch(
        "device_views.storage.postgres.build_postgres_storage",
        side_effect=[failure, storage],
    ):
        with pytest.raises(StorageConnectionError) as error:
            await service.start()
        assert str(error.value) == "Failed to initialize device views storage"
        assert error.value.__cause__ is failure
        with pytest.raises(StorageNotInitializedError):
            await service.list()
        await service.stop()

        await service.start()
        assert await service.list() is storage.list.return_value
        await service.stop()
        storage.close.assert_awaited_once()
