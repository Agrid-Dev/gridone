from datetime import UTC, datetime

import pytest

from devices_manager.core.device_group import DeviceGroup
from devices_manager.storage.memory import MemoryDevicesStorage
from devices_manager.storage.yaml import CoreFileStorage

pytestmark = pytest.mark.asyncio


@pytest.mark.parametrize("backend", ["memory", "yaml"])
async def test_group_storage_roundtrip_and_copy_isolation(backend, tmp_path):
    storage = (
        MemoryDevicesStorage() if backend == "memory" else CoreFileStorage(tmp_path)
    )
    group = DeviceGroup(
        id="group",
        name="East",
        driver_id="driver",
        device_ids=["a", "b"],
        created_at=datetime.now(UTC),
        updated_at=datetime.now(UTC),
    )
    await storage.groups.write(group.id, group)
    stored = await storage.groups.read(group.id)
    assert stored == group
    stored.device_ids.clear()
    assert (await storage.groups.read_all())[0].device_ids == ["a", "b"]
    assert await storage.groups.list_all() == ["group"]
    if backend == "yaml":
        reloaded = CoreFileStorage(tmp_path)
        assert await reloaded.groups.read(group.id) == group
    await storage.groups.delete(group.id)
    assert await storage.groups.read_all() == []


async def test_yaml_group_survives_service_restart(tmp_path):
    from devices_manager import DevicesService
    from devices_manager.core.device import CoreDevice, DeviceBase
    from devices_manager.core.device_group import DeviceGroupCreate
    from devices_manager.core.driver import Driver, DriverMetadata, UpdateStrategy
    from devices_manager.core.transports import (
        TransportMetadata,
        make_transport_client,
        make_transport_config,
    )
    from devices_manager.types import TransportProtocols

    storage = CoreFileStorage(tmp_path)
    driver = Driver(
        metadata=DriverMetadata(id="driver"),
        transport=TransportProtocols.HTTP,
        env={},
        device_config_required=[],
        update_strategy=UpdateStrategy(),
        attributes={},
    )
    transport = make_transport_client(
        TransportProtocols.HTTP,
        make_transport_config(TransportProtocols.HTTP, {}),
        TransportMetadata(id="transport", name="Transport"),
    )
    member = CoreDevice.from_base(
        DeviceBase(id="member", name="Room", config={}),
        driver=driver,
        transport=transport,
    )
    await storage.drivers.write(driver.id, driver)
    await storage.transports.write(transport.id, transport)
    await storage.devices.write(member.id, member)
    service = DevicesService(f"yaml:{tmp_path}")
    await service.load()
    group = await service.create_group(
        DeviceGroupCreate(name="East", driver_id=driver.id, device_ids=[member.id])
    )
    await service.stop()
    reloaded = DevicesService(f"yaml:{tmp_path}")
    await reloaded.load()
    try:
        assert reloaded.get_group(group.id) == group
        assert reloaded.get_device(member.id).name == "Room"
    finally:
        await reloaded.stop()
