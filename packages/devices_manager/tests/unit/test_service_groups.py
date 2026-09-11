import asyncio
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
import pytest_asyncio
from pydantic import ValidationError

from devices_manager import DevicesService
from devices_manager.core.device import CoreDevice, DeviceBase
from devices_manager.core.device_group import DeviceGroupCreate, DeviceGroupUpdate
from devices_manager.core.driver import (
    AttributeDriver,
    Driver,
    DriverMetadata,
    UpdateStrategy,
)
from devices_manager.core.transports import (
    TransportMetadata,
    make_transport_client,
    make_transport_config,
)
from devices_manager.dto import DeviceUpdate
from devices_manager.storage.storage_backend import DevicesManagerStorage
from devices_manager.types import DataType, TransportProtocols
from models.errors import NotFoundError
from models.resource_conflict import RelatedResource, ResourceConflictError

pytestmark = pytest.mark.asyncio


@pytest_asyncio.fixture
async def service():
    storage = MagicMock(spec=DevicesManagerStorage)
    for name in ("groups", "devices", "drivers", "transports"):
        port = AsyncMock()
        port.list_all.return_value = []
        port.read_all.return_value = []
        setattr(storage, name, port)
    driver = Driver(
        metadata=DriverMetadata(id="driver-a"),
        transport=TransportProtocols.HTTP,
        env={},
        device_config_required=[],
        update_strategy=UpdateStrategy(),
        attributes={
            "setpoint": AttributeDriver(
                name="setpoint",
                data_type=DataType.FLOAT,
                read="GET /value",
                write="POST /value",
                codecs=[],
            )
        },
    )
    from copy import deepcopy

    other = deepcopy(driver)
    other.metadata = DriverMetadata(id="driver-b")
    transport = make_transport_client(
        TransportProtocols.HTTP,
        make_transport_config(TransportProtocols.HTTP, {}),
        TransportMetadata(id="transport", name="Transport"),
    )
    devices = {
        name: CoreDevice.from_base(
            DeviceBase(id=name, name=name, config={}),
            driver=other if name == "other" else driver,
            transport=transport,
        )
        for name in ("a", "b", "other")
    }
    svc = DevicesService(drivers={driver.id: driver, other.id: other}, devices=devices)
    with patch(
        "devices_manager.service.build_storage", AsyncMock(return_value=storage)
    ):
        await svc.load()
    return svc, storage


def params(*ids: str) -> DeviceGroupCreate:
    return DeviceGroupCreate(
        name="East rooms", driver_id="driver-a", device_ids=list(ids)
    )


async def test_create_deduplicates_members_and_returns_metadata(service):
    svc, storage = service
    group = await svc.create_group(params("a", "a", "b"))
    assert group.device_ids == ["a", "b"]
    assert len(group.id) == 16
    assert group.created_at == group.updated_at
    storage.groups.compare_and_swap.assert_awaited_once_with(group.id, group, None)
    assert svc.get_group(group.id) == group
    group.device_ids.clear()
    assert svc.get_group(group.id).device_ids == ["a", "b"]


@pytest.mark.parametrize(
    ("ids", "error"),
    [(["a", "missing"], NotFoundError), (["a", "other"], ResourceConflictError)],
)
async def test_invalid_members_do_not_persist_partial_group(service, ids, error):
    svc, storage = service
    with pytest.raises(error):
        await svc.create_group(params(*ids))
    storage.groups.compare_and_swap.assert_not_awaited()
    assert svc.list_groups() == []


async def test_unknown_driver_cannot_create_empty_group(service):
    svc, storage = service
    with pytest.raises(NotFoundError):
        await svc.create_group(DeviceGroupCreate(name="Empty", driver_id="missing"))
    storage.groups.compare_and_swap.assert_not_awaited()


async def test_memberships_are_independent_and_group_can_be_empty(service):
    svc, _ = service
    first = await svc.create_group(params("a"))
    second = await svc.create_group(params("a", "b"))
    changed = await svc.update_group(
        first.id, DeviceGroupUpdate(name="Renamed", device_ids=[])
    )
    assert changed.driver_id == first.driver_id
    assert changed.created_at == first.created_at
    assert changed.updated_at >= first.updated_at
    assert svc.get_group(second.id).device_ids == ["a", "b"]
    assert [g.id for g in svc.list_groups(device_id="a")] == [second.id]
    assert len(svc.list_groups(driver_id="driver-a")) == 2
    assert svc.list_groups(driver_id="driver-b") == []


async def test_failed_update_leaves_original_members(service):
    svc, storage = service
    group = await svc.create_group(params("a"))
    storage.groups.compare_and_swap.reset_mock()
    with pytest.raises(ResourceConflictError) as error:
        await svc.update_group(
            group.id, DeviceGroupUpdate(name="Bad", device_ids=["b", "other"])
        )
    assert error.value.code == "group_incompatible_member"
    assert [r.id for r in error.value.resources] == ["other", "driver-a", "driver-b"]
    assert svc.get_group(group.id) == group
    storage.groups.compare_and_swap.assert_not_awaited()


async def test_storage_failure_does_not_publish_group(service):
    svc, storage = service
    storage.groups.compare_and_swap.side_effect = OSError("storage unavailable")
    with pytest.raises(OSError, match="storage unavailable"):
        await svc.create_group(params("a"))
    assert svc.list_groups() == []


async def test_delete_group_keeps_devices(service):
    svc, storage = service
    group = await svc.create_group(params("a"))
    await svc.delete_group(group.id)
    assert svc.get_device("a").id == "a"
    storage.devices.delete.assert_not_awaited()
    with pytest.raises(NotFoundError):
        svc.get_group(group.id)


async def test_delete_device_removes_all_memberships(service):
    svc, _ = service
    groups = [
        await svc.create_group(params("a")),
        await svc.create_group(params("a", "b")),
    ]
    await svc.delete_device("a")
    assert svc.get_group(groups[0].id).device_ids == []
    assert svc.get_group(groups[1].id).device_ids == ["b"]
    with pytest.raises(NotFoundError):
        svc.get_device("a")


async def test_driver_change_blocked_with_group_links_but_name_edit_allowed(service):
    svc, _ = service
    group = await svc.create_group(params("a"))
    with pytest.raises(ResourceConflictError) as error:
        await svc.update_device("a", DeviceUpdate(driver_id="driver-b"))
    assert error.value.resources == [
        RelatedResource(kind="device_group", id=group.id, name=group.name)
    ]
    assert svc.get_device("a").driver_id == "driver-a"
    assert (
        await svc.update_device("a", DeviceUpdate(name="New name"))
    ).name == "New name"


async def test_empty_group_blocks_driver_deletion(service):
    svc, storage = service
    await svc.create_group(params())
    with pytest.raises(ResourceConflictError) as error:
        await svc.delete_driver("driver-a")
    assert error.value.code == "driver_group_references"
    storage.drivers.delete.assert_not_awaited()


async def test_references_block_deletion_and_are_checked_under_lock(service):
    svc, storage = service
    group = await svc.create_group(params("a"))

    async def references(group_id) -> list[RelatedResource]:
        assert group_id == group.id
        assert svc.mutation_lock.locked()
        return [RelatedResource(kind="automation", id="automation", name="Comfort")]

    svc.group_references = references
    with pytest.raises(ResourceConflictError) as error:
        await svc.delete_group(group.id)
    assert error.value.code == "group_references"
    storage.groups.delete.assert_not_awaited()
    svc.group_references = AsyncMock(return_value=[])
    await svc.delete_group(group.id)


async def test_concurrent_delete_and_membership_update_cannot_leave_missing_member(
    service,
):
    svc, _ = service
    group = await svc.create_group(params())
    results = await asyncio.gather(
        svc.delete_device("a"),
        svc.update_group(
            group.id, DeviceGroupUpdate(name=group.name, device_ids=["a"])
        ),
        return_exceptions=True,
    )
    assert isinstance(results[1], NotFoundError)
    assert svc.get_group(group.id).device_ids == []


@pytest.mark.parametrize("name", ["", "   ", "x" * 201])
async def test_group_name_validation(name):
    with pytest.raises(ValidationError):
        DeviceGroupCreate(name=name, driver_id="driver-a")


async def test_edit_cannot_change_driver():
    with pytest.raises(ValidationError):
        DeviceGroupUpdate.model_validate(
            {"name": "East", "device_ids": [], "driver_id": "different"}
        )
