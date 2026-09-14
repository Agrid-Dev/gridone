from datetime import UTC, datetime
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from devices_manager import DevicesService
from devices_manager.core.device import CoreDevice, DeviceStorage
from devices_manager.core.tags import TagMutation
from devices_manager.storage.storage_backend import DevicesManagerStorage

pytestmark = pytest.mark.asyncio


async def test_bulk_tags_preserve_other_values_and_report_partial_failure(
    device: CoreDevice,
):
    device.tags = {"ecs": ["east"], "floor": ["2"]}
    before = device.updated_at
    storage = MagicMock(spec=DevicesManagerStorage)
    storage.devices = AsyncMock(spec=DeviceStorage)
    storage.drivers = AsyncMock()
    storage.transports = AsyncMock()
    service = DevicesService(
        devices={device.id: device},
        drivers={device.driver_id: device.driver},
        transports={device.transport_id: device.transport},
    )
    with patch("devices_manager.service.build_storage", return_value=storage):
        await service.load()
    storage.devices.set_tag.side_effect = OSError("secret database details")
    failure, missing = await service.mutate_device_tags(
        [device.id, device.id, "missing"], TagMutation(key="ECS", add=["west"])
    )
    assert failure.status == "failed"
    assert failure.error == "storage_failure"
    assert "secret" not in failure.model_dump_json()
    assert missing.error == "not_found"
    assert device.tags == {"ecs": ["east"], "floor": ["2"]}
    assert device.updated_at == before
    storage.devices.set_tag.side_effect = None
    added = await service.mutate_device_tags(
        [device.id], TagMutation(key="ecs", add=["WEST", "west"])
    )
    assert added[0].tags == {"ecs": ["east", "west"], "floor": ["2"]}
    unchanged = await service.mutate_device_tags(
        [device.id], TagMutation(key="ecs", add=["west"])
    )
    assert unchanged[0].status == "unchanged"
    renamed = await service.mutate_device_tags(
        [device.id], TagMutation(key="ecs", remove=["east"], add=["north"])
    )
    assert renamed[0].tags == {"ecs": ["north", "west"], "floor": ["2"]}
    removed = await service.mutate_device_tags(
        [device.id], TagMutation(key="ecs", remove=["north", "west"])
    )
    assert removed[0].tags == {"floor": ["2"]}
    stale_rename = await service.mutate_device_tags(
        [device.id],
        TagMutation(key="ecs", remove=["east"], add=["north"], require_value="east"),
    )
    assert stale_rename[0].status == "unchanged"
    assert stale_rename[0].tags == {"floor": ["2"]}
    assert storage.devices.set_tag.await_count == 4
    assert device.updated_at <= datetime.now(UTC)


async def test_replace_and_delete_tag_use_canonical_keys(device: CoreDevice):
    storage = MagicMock(spec=DevicesManagerStorage)
    storage.devices = AsyncMock(spec=DeviceStorage)
    storage.drivers = AsyncMock()
    storage.transports = AsyncMock()
    service = DevicesService(
        devices={device.id: device},
        drivers={device.driver_id: device.driver},
        transports={device.transport_id: device.transport},
    )
    with patch("devices_manager.service.build_storage", return_value=storage):
        await service.load()
    result = await service.set_device_tag(device.id, "ÉTAGE", ["2", "3", "3"])
    assert result.tags["étage"] == ["2", "3"]
    await service.delete_device_tag(device.id, "E\u0301TAGE")
    assert device.tags == {}
