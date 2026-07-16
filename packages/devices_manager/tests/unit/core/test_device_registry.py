from __future__ import annotations

from typing import TYPE_CHECKING
from unittest.mock import AsyncMock, MagicMock

import pytest
import pytest_asyncio

from devices_manager.core.device import (
    CoreDevice,
    DeviceBase,
)
from devices_manager.core.device.connection_status import CONNECTION_STATUS_ATTR
from devices_manager.core.device.event_log import AttributeLogs
from devices_manager.core.device_registry import DeviceRegistry
from devices_manager.dto import (
    Device,
    DeviceCreate,
    DeviceUpdate,
)
from devices_manager.storage import DeviceStorageBackend
from models.errors import InvalidError, NotFoundError

if TYPE_CHECKING:
    from collections.abc import Callable

    from devices_manager.core.driver import Driver
    from devices_manager.core.transports import TransportClient


def _make_driver_resolver(
    *drivers: Driver,
) -> Callable[[str], Driver]:
    """Build a resolver from driver instances."""
    by_id = {d.id: d for d in drivers}

    def _resolve(did: str) -> Driver:
        try:
            return by_id[did]
        except KeyError as e:
            msg = f"Driver {did} not found"
            raise NotFoundError(msg) from e

    return _resolve


def _make_transport_resolver(
    *transports: TransportClient,
) -> Callable[[str], TransportClient]:
    """Build a resolver from transport instances."""
    by_id = {t.id: t for t in transports}

    def _resolve(tid: str) -> TransportClient:
        try:
            return by_id[tid]
        except KeyError as e:
            msg = f"Transport {tid} not found"
            raise NotFoundError(msg) from e

    return _resolve


@pytest.fixture
def on_attribute_update():
    return MagicMock()


@pytest_asyncio.fixture
async def device_registry(
    device, driver, mock_transport_client, on_attribute_update
) -> DeviceRegistry:
    registry = DeviceRegistry(
        resolve_driver=_make_driver_resolver(driver),
        resolve_transport=_make_transport_resolver(mock_transport_client),
        on_attribute_update=on_attribute_update,
    )
    await registry.register(device)
    return registry


@pytest.fixture
def empty_registry(
    driver, mock_transport_client, on_attribute_update
) -> DeviceRegistry:
    return DeviceRegistry(
        resolve_driver=_make_driver_resolver(driver),
        resolve_transport=_make_transport_resolver(mock_transport_client),
        on_attribute_update=on_attribute_update,
    )


class TestDeviceRegistryInit:
    def test_init_empty(self, driver, mock_transport_client):
        registry = DeviceRegistry(
            resolve_driver=_make_driver_resolver(driver),
            resolve_transport=_make_transport_resolver(mock_transport_client),
        )
        assert registry.ids == set()

    def test_init_with_devices(self, device_registry, device):
        assert device.id in device_registry.ids

    def test_sets_on_update_callback_on_devices(
        self,
        device,
        driver,
        mock_transport_client,
        on_attribute_update,
    ):
        registry = DeviceRegistry(
            {device.id: device},
            resolve_driver=_make_driver_resolver(driver),
            resolve_transport=_make_transport_resolver(mock_transport_client),
            on_attribute_update=on_attribute_update,
        )
        assert registry.all[device.id].on_update is on_attribute_update


class TestDeviceRegistryGet:
    def test_get_ok(self, device_registry, device):
        result = device_registry.get(device.id)
        assert result is device

    def test_get_not_found(self, device_registry):
        with pytest.raises(NotFoundError):
            device_registry.get("unknown")

    def test_get_dto(self, device_registry, device):
        dto = device_registry.get_dto(device.id)
        assert isinstance(dto, Device)
        assert dto.id == device.id

    def test_get_dto_not_found(self, device_registry):
        with pytest.raises(NotFoundError):
            device_registry.get_dto("unknown")


class TestDeviceRegistryList:
    def test_list_all(self, device_registry):
        devices = device_registry.list_all()
        assert len(devices) == 1
        assert all(isinstance(d, Device) for d in devices)

    def test_list_all_filter_wiring(
        self,
        thermostat_driver,
        driver,
        mock_transport_client,
        on_attribute_update,
    ):
        device_typed = CoreDevice.from_base(
            DeviceBase(id="d1", name="Typed", config={}),
            driver=thermostat_driver,
            transport=mock_transport_client,
        )
        device_untyped = CoreDevice.from_base(
            DeviceBase(id="d2", name="Untyped", config={}),
            driver=driver,
            transport=mock_transport_client,
        )
        registry = DeviceRegistry(
            {device_typed.id: device_typed, device_untyped.id: device_untyped},
            resolve_driver=_make_driver_resolver(thermostat_driver, driver),
            resolve_transport=_make_transport_resolver(mock_transport_client),
            on_attribute_update=on_attribute_update,
        )
        result = registry.list_all(types=["thermostat"])
        assert len(result) == 1
        assert result[0].id == "d1"

    def test_list_all_filter_by_driver_id(
        self,
        thermostat_driver,
        driver,
        mock_transport_client,
        on_attribute_update,
    ):
        device_a = CoreDevice.from_base(
            DeviceBase(id="d1", name="A", config={}),
            driver=thermostat_driver,
            transport=mock_transport_client,
        )
        device_b = CoreDevice.from_base(
            DeviceBase(id="d2", name="B", config={}),
            driver=driver,
            transport=mock_transport_client,
        )
        registry = DeviceRegistry(
            {device_a.id: device_a, device_b.id: device_b},
            resolve_driver=_make_driver_resolver(thermostat_driver, driver),
            resolve_transport=_make_transport_resolver(mock_transport_client),
            on_attribute_update=on_attribute_update,
        )
        result = registry.list_all(driver_id=driver.metadata.id)
        assert [d.id for d in result] == ["d2"]


class TestDeviceRegistryRegister:
    @pytest.mark.asyncio
    async def test_register_ok(self, empty_registry, device):
        await empty_registry.register(device)
        assert device.id in empty_registry.ids

    @pytest.mark.asyncio
    async def test_register_duplicate_raises(self, device_registry, device):
        with pytest.raises(ValueError):  # noqa: PT011
            await device_registry.register(device)


class TestDeviceRegistryAddPhysical:
    @pytest.mark.asyncio
    async def test_add_physical_device_ok(
        self, empty_registry, driver, mock_transport_client
    ):
        create = DeviceCreate(
            name="New Device",
            config={"some_id": "abc"},
            driver_id=driver.id,
            transport_id=mock_transport_client.id,
        )
        device = await empty_registry.add(create)
        assert isinstance(device, CoreDevice)
        assert device.name == "New Device"
        assert device.id in empty_registry.ids

    @pytest.mark.asyncio
    async def test_add_physical_device_driver_not_found(
        self, empty_registry, mock_transport_client
    ):
        create = DeviceCreate(
            name="Bad",
            config={"some_id": "abc"},
            driver_id="unknown_driver",
            transport_id=mock_transport_client.id,
        )
        with pytest.raises(NotFoundError):
            await empty_registry.add(create)

    @pytest.mark.asyncio
    async def test_add_physical_device_transport_not_found(
        self, empty_registry, driver
    ):
        create = DeviceCreate(
            name="Bad",
            config={"some_id": "abc"},
            driver_id=driver.id,
            transport_id="unknown_transport",
        )
        with pytest.raises(NotFoundError):
            await empty_registry.add(create)

    @pytest.mark.asyncio
    async def test_add_physical_device_incompatible_transport(
        self, driver, mock_push_transport_client, on_attribute_update
    ):
        registry = DeviceRegistry(
            resolve_driver=_make_driver_resolver(driver),
            resolve_transport=_make_transport_resolver(mock_push_transport_client),
            on_attribute_update=on_attribute_update,
        )
        create = DeviceCreate(
            name="Bad",
            config={"some_id": "abc"},
            driver_id=driver.id,
            transport_id=mock_push_transport_client.id,
        )
        with pytest.raises(ValueError):  # noqa: PT011
            await registry.add(create)

    @pytest.mark.asyncio
    async def test_add_physical_device_invalid_config(
        self, empty_registry, driver, mock_transport_client
    ):
        create = DeviceCreate(
            name="Bad",
            config={},
            driver_id=driver.id,
            transport_id=mock_transport_client.id,
        )
        with pytest.raises(InvalidError):
            await empty_registry.add(create)

    @pytest.mark.asyncio
    async def test_add_sets_on_update_callback(
        self,
        empty_registry,
        driver,
        mock_transport_client,
        on_attribute_update,
    ):
        create = DeviceCreate(
            name="Device",
            config={"some_id": "abc"},
            driver_id=driver.id,
            transport_id=mock_transport_client.id,
        )
        device = await empty_registry.add(create)
        assert device.on_update is on_attribute_update


class TestDeviceRegistryUpdate:
    @pytest.mark.asyncio
    async def test_update_name(self, device_registry, device):
        result = await device_registry.update(device.id, DeviceUpdate(name="New Name"))
        assert result.name == "New Name"

    @pytest.mark.asyncio
    async def test_update_empty_payload(self, device_registry, device):
        original_name = device.name
        result = await device_registry.update(device.id, DeviceUpdate())
        assert result.name == original_name

    @pytest.mark.asyncio
    async def test_set_tag(self, device_registry, device):
        result = await device_registry.set_tag(device.id, "asset_id", "floor1")
        assert result.tags == {"asset_id": "floor1"}

    @pytest.mark.asyncio
    async def test_set_tag_overwrite(self, device_registry, device):
        await device_registry.set_tag(device.id, "asset_id", "floor1")
        result = await device_registry.set_tag(device.id, "asset_id", "floor2")
        assert result.tags == {"asset_id": "floor2"}

    @pytest.mark.asyncio
    async def test_delete_tag(self, device_registry, device):
        device.tags = {"asset_id": "floor1"}
        result = await device_registry.delete_tag(device.id, "asset_id")
        assert "asset_id" not in result.tags

    @pytest.mark.asyncio
    async def test_delete_tag_noop_if_missing(self, device_registry, device):
        result = await device_registry.delete_tag(device.id, "nonexistent")
        assert result.tags == {}

    @pytest.mark.asyncio
    async def test_set_tag_calls_storage_set_tag_not_write(
        self, device, driver, mock_transport_client, on_attribute_update
    ):
        storage = AsyncMock(spec=DeviceStorageBackend)
        registry = DeviceRegistry(
            {device.id: device},
            resolve_driver=_make_driver_resolver(driver),
            resolve_transport=_make_transport_resolver(mock_transport_client),
            on_attribute_update=on_attribute_update,
            storage=storage,
        )
        await registry.set_tag(device.id, "zone", "north")
        storage.set_tag.assert_awaited_once_with(device.id, "zone", "north")
        storage.write.assert_not_awaited()

    @pytest.mark.asyncio
    async def test_delete_tag_calls_storage_delete_tag_not_write(
        self, device, driver, mock_transport_client, on_attribute_update
    ):
        device.tags = {"zone": "north"}
        storage = AsyncMock(spec=DeviceStorageBackend)
        registry = DeviceRegistry(
            {device.id: device},
            resolve_driver=_make_driver_resolver(driver),
            resolve_transport=_make_transport_resolver(mock_transport_client),
            on_attribute_update=on_attribute_update,
            storage=storage,
        )
        await registry.delete_tag(device.id, "zone")
        storage.delete_tag.assert_awaited_once_with(device.id, "zone")
        storage.write.assert_not_awaited()

    @pytest.mark.asyncio
    async def test_update_not_found(self, device_registry):
        with pytest.raises(NotFoundError):
            await device_registry.update("unknown", DeviceUpdate(name="X"))

    @pytest.mark.asyncio
    async def test_update_config_ok(self, device_registry, device):
        new_config = {"some_id": "xyz"}
        result = await device_registry.update(
            device.id, DeviceUpdate(config=new_config)
        )
        assert isinstance(result, CoreDevice)
        assert result.config == new_config

    @pytest.mark.asyncio
    async def test_update_config_invalid(self, device_registry, device):
        with pytest.raises(InvalidError):
            await device_registry.update(device.id, DeviceUpdate(config={}))

    @pytest.mark.asyncio
    async def test_update_driver_not_found(self, device_registry, device):
        with pytest.raises(NotFoundError):
            await device_registry.update(device.id, DeviceUpdate(driver_id="unknown"))

    @pytest.mark.asyncio
    async def test_update_transport_not_found(self, device_registry, device):
        with pytest.raises(NotFoundError):
            await device_registry.update(
                device.id, DeviceUpdate(transport_id="unknown")
            )

    @pytest.mark.asyncio
    async def test_update_driver_ok(
        self,
        device,
        driver,
        mock_transport_client,
        other_http_driver,
        on_attribute_update,
    ):
        registry = DeviceRegistry(
            {device.id: device},
            resolve_driver=_make_driver_resolver(driver, other_http_driver),
            resolve_transport=_make_transport_resolver(mock_transport_client),
            on_attribute_update=on_attribute_update,
        )
        result = await registry.update(
            device.id,
            DeviceUpdate(driver_id=other_http_driver.id),
        )
        assert isinstance(result, CoreDevice)
        assert result.driver_id == other_http_driver.id
        assert "power" in result.attributes

    @pytest.mark.asyncio
    async def test_update_driver_incompatible(
        self,
        device,
        driver,
        mock_transport_client,
        driver_w_push_transport,
        on_attribute_update,
    ):
        registry = DeviceRegistry(
            {device.id: device},
            resolve_driver=_make_driver_resolver(driver, driver_w_push_transport),
            resolve_transport=_make_transport_resolver(mock_transport_client),
            on_attribute_update=on_attribute_update,
        )
        with pytest.raises(ValueError):  # noqa: PT011
            await registry.update(
                device.id,
                DeviceUpdate(driver_id=driver_w_push_transport.id),
            )

    @pytest.mark.asyncio
    async def test_update_transport_ok(
        self,
        device,
        driver,
        mock_transport_client,
        second_mock_transport_client,
        on_attribute_update,
    ):
        registry = DeviceRegistry(
            {device.id: device},
            resolve_driver=_make_driver_resolver(driver),
            resolve_transport=_make_transport_resolver(
                mock_transport_client, second_mock_transport_client
            ),
            on_attribute_update=on_attribute_update,
        )
        result = await registry.update(
            device.id,
            DeviceUpdate(transport_id=second_mock_transport_client.id),
        )
        assert isinstance(result, CoreDevice)
        assert result.transport_id == second_mock_transport_client.id

    @pytest.mark.asyncio
    async def test_update_driver_preserves_attribute_values(
        self,
        device,
        driver,
        mock_transport_client,
        other_http_driver,
        on_attribute_update,
    ):
        device.attributes["temperature"].update_value(42.0)
        registry = DeviceRegistry(
            {device.id: device},
            resolve_driver=_make_driver_resolver(driver, other_http_driver),
            resolve_transport=_make_transport_resolver(mock_transport_client),
            on_attribute_update=on_attribute_update,
        )
        result = await registry.update(
            device.id,
            DeviceUpdate(driver_id=other_http_driver.id),
        )
        assert isinstance(result, CoreDevice)
        assert result.attributes["temperature"].current_value == 42.0

    @pytest.mark.asyncio
    async def test_rebuild_replaces_device_in_registry(
        self,
        device,
        driver,
        mock_transport_client,
        other_http_driver,
        on_attribute_update,
    ):
        registry = DeviceRegistry(
            {device.id: device},
            resolve_driver=_make_driver_resolver(driver, other_http_driver),
            resolve_transport=_make_transport_resolver(mock_transport_client),
            on_attribute_update=on_attribute_update,
        )
        result = await registry.update(
            device.id,
            DeviceUpdate(driver_id=other_http_driver.id),
        )
        assert registry.get(device.id) is result
        assert result is not device


class TestDeviceRegistryRemove:
    @pytest.mark.asyncio
    async def test_remove_ok(self, device_registry, device):
        await device_registry.remove(device.id)
        assert device.id not in device_registry.ids

    @pytest.mark.asyncio
    async def test_remove_not_found(self, device_registry):
        with pytest.raises(NotFoundError):
            await device_registry.remove("unknown")


class TestDeviceRegistryWriteAttribute:
    @pytest.mark.asyncio
    async def test_write_attribute_device_not_found(self, device_registry):
        with pytest.raises(NotFoundError):
            await device_registry.write_attribute("unknown", "temp", 22.0)

    @pytest.mark.asyncio
    async def test_write_attribute_attribute_not_found(self, device_registry, device):
        with pytest.raises(NotFoundError):
            await device_registry.write_attribute(device.id, "nonexistent", 22.0)

    @pytest.mark.asyncio
    async def test_write_attribute_not_writable(self, device_registry, device):
        with pytest.raises(PermissionError):
            await device_registry.write_attribute(device.id, "temperature", 22.0)

    @pytest.mark.asyncio
    async def test_write_attribute_internal_raises_permission_error(
        self, device_registry, device
    ):
        with pytest.raises(PermissionError):
            await device_registry.write_attribute(
                device.id, CONNECTION_STATUS_ATTR, "ok"
            )


class TestDeviceRegistryRefreshAttribute:
    @pytest.mark.asyncio
    async def test_refresh_attribute_returns_fresh_value(
        self, device_registry, device, mock_transport_client
    ):
        mock_transport_client.read = AsyncMock(return_value=23.5)
        result = await device_registry.refresh_attribute(device.id, "temperature")
        assert result.current_value == 23.5

    @pytest.mark.asyncio
    async def test_refresh_attribute_device_not_found(self, device_registry):
        with pytest.raises(NotFoundError):
            await device_registry.refresh_attribute("unknown", "temperature")

    @pytest.mark.asyncio
    async def test_refresh_attribute_attribute_not_found(self, device_registry, device):
        with pytest.raises(NotFoundError):
            await device_registry.refresh_attribute(device.id, "nonexistent")


class TestDeviceRegistryRebuild:
    def test_rebuild_device(
        self,
        device_registry,
        device,
        other_http_driver,
        mock_transport_client,
    ):
        result = device_registry.rebuild_device(
            device, other_http_driver, mock_transport_client
        )
        assert isinstance(result, CoreDevice)
        assert result.id == device.id
        assert result.driver_id == other_http_driver.id

    def test_rebuild_preserves_values(
        self,
        device_registry,
        device,
        other_http_driver,
        mock_transport_client,
    ):
        device.attributes["temperature"].update_value(25.5)
        result = device_registry.rebuild_device(
            device, other_http_driver, mock_transport_client
        )
        assert result.attributes["temperature"].current_value == 25.5

    def test_rebuild_preserves_timestamps(
        self,
        device_registry,
        device,
        other_http_driver,
        mock_transport_client,
    ):
        """Regression AGR-887: a rebuild must not reset last_updated/last_changed."""
        device.attributes["temperature"].update_value(25.5)
        original = device.attributes["temperature"]
        assert original.last_updated is not None
        assert original.last_changed is not None

        result = device_registry.rebuild_device(
            device, other_http_driver, mock_transport_client
        )

        rebuilt = result.attributes["temperature"]
        assert rebuilt.last_updated == original.last_updated
        assert rebuilt.last_changed == original.last_changed


class TestDeviceRegistryPersistence:
    @pytest.mark.asyncio
    async def test_add_persists_to_storage(
        self, driver, mock_transport_client, on_attribute_update
    ):
        storage = AsyncMock(spec=DeviceStorageBackend)
        registry = DeviceRegistry(
            resolve_driver=_make_driver_resolver(driver),
            resolve_transport=_make_transport_resolver(mock_transport_client),
            on_attribute_update=on_attribute_update,
            storage=storage,
        )
        create = DeviceCreate(
            name="Device",
            config={"some_id": "abc"},
            driver_id=driver.id,
            transport_id=mock_transport_client.id,
        )
        await registry.add(create)
        storage.write.assert_called_once()

    @pytest.mark.asyncio
    async def test_register_persists_to_storage(
        self, driver, mock_transport_client, on_attribute_update
    ):
        storage = AsyncMock(spec=DeviceStorageBackend)
        registry = DeviceRegistry(
            resolve_driver=_make_driver_resolver(driver),
            resolve_transport=_make_transport_resolver(mock_transport_client),
            on_attribute_update=on_attribute_update,
            storage=storage,
        )
        device = CoreDevice.from_base(
            DeviceBase(id="d1", name="Device", config={"some_id": "abc"}),
            driver=driver,
            transport=mock_transport_client,
        )
        await registry.register(device)
        storage.write.assert_called_once()

    @pytest.mark.asyncio
    async def test_update_persists_to_storage(
        self, device, driver, mock_transport_client, on_attribute_update
    ):
        storage = AsyncMock(spec=DeviceStorageBackend)
        registry = DeviceRegistry(
            {device.id: device},
            resolve_driver=_make_driver_resolver(driver),
            resolve_transport=_make_transport_resolver(mock_transport_client),
            on_attribute_update=on_attribute_update,
            storage=storage,
        )
        await registry.update(device.id, DeviceUpdate(name="New"))
        storage.write.assert_called_once()

    @pytest.mark.asyncio
    async def test_remove_deletes_from_storage(
        self, device, driver, mock_transport_client, on_attribute_update
    ):
        storage = AsyncMock(spec=DeviceStorageBackend)
        registry = DeviceRegistry(
            {device.id: device},
            resolve_driver=_make_driver_resolver(driver),
            resolve_transport=_make_transport_resolver(mock_transport_client),
            on_attribute_update=on_attribute_update,
            storage=storage,
        )
        await registry.remove(device.id)
        storage.delete.assert_called_once_with(device.id)


class TestDeviceRegistryGetAttributeLogs:
    def test_returns_attribute_logs(self, device_registry, device):
        result = device_registry.get_attribute_logs(device.id, "temperature")
        assert isinstance(result, AttributeLogs)
        assert result.read == []
        assert result.write == []
        assert result.listen == []

    def test_raises_not_found_for_unknown_device(self, device_registry):
        with pytest.raises(NotFoundError):
            device_registry.get_attribute_logs("unknown-device", "temperature")

    def test_raises_not_found_for_unknown_attribute(self, device_registry, device):
        with pytest.raises(NotFoundError):
            device_registry.get_attribute_logs(device.id, "nonexistent")
