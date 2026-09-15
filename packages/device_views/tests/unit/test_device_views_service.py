from unittest.mock import AsyncMock, patch

import pytest

from device_views import DeviceViewInput, DeviceViewsService
from device_views.storage.protocol import ViewStorage
from models.errors import StorageNotInitializedError, UnsupportedStorageError

pytestmark = pytest.mark.asyncio


async def test_service_returns_storage_result_and_preserves_creation_time():
    storage = AsyncMock(spec=ViewStorage)
    storage.create.side_effect = lambda view: view
    storage.update.side_effect = lambda view: view
    with patch("device_views.service.build_storage", return_value=storage) as build:
        service = DeviceViewsService(None)
        await service.start()
        await service.start()
        build.assert_awaited_once_with(None)
        created = await service.create(
            DeviceViewInput(name="Building", group_by=["floor"])
        )
        assert len(created.id) == 16
        storage.get.assert_not_awaited()
        storage.get.return_value = created
        updated = await service.update(
            created.id, DeviceViewInput(name="Renamed", group_by=["floor", "room"])
        )
        assert updated.created_at == created.created_at
        assert updated.updated_at >= created.updated_at
        assert updated.name == "Renamed"
        assert updated is storage.update.call_args.args[0]
        await service.delete(created.id)
        storage.delete.assert_awaited_once_with(created.id)
        await service.list()
        storage.list.assert_awaited_once()
        await service.stop()
        await service.stop()
        storage.close.assert_awaited_once()
        with pytest.raises(StorageNotInitializedError):
            await service.list()


async def test_unsupported_storage_fails_before_start():
    service = DeviceViewsService("unsupported://server")
    with pytest.raises(UnsupportedStorageError):
        await service.start()
    await service.stop()
