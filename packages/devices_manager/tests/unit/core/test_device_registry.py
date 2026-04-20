from __future__ import annotations

from typing import TYPE_CHECKING
from unittest.mock import AsyncMock, MagicMock

import pytest

from devices_manager.core.device import (
    Attribute,
    DeviceBase,
    PhysicalDevice,
    VirtualDevice,
)
from devices_manager.core.device_registry import DeviceRegistry
from devices_manager.dto import (
    AttributeCreate,
    Device,
    DeviceUpdate,
    VirtualDeviceCreate,
)
from devices_manager.dto import (
    PhysicalDeviceCreate as DeviceCreate,
)
from devices_manager.storage import StorageBackend
from devices_manager.types import DataType
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


@pytest.fixture
def device_registry(
    device, driver, mock_transport_client, on_attribute_update
) -> DeviceRegistry:
    return DeviceRegistry(
        {device.id: device},
        resolve_driver=_make_driver_resolver(driver),
        resolve_transport=_make_transport_resolver(mock_transport_client),
        on_attribute_update=on_attribute_update,
    )


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

    def test_list_filter_by_type(
        self,
        thermostat_driver,
        driver,
        mock_transport_client,
        on_attribute_update,
    ):
        device_typed = PhysicalDevice.from_base(
            DeviceBase(id="d1", name="Typed", config={}),
            driver=thermostat_driver,
            transport=mock_transport_client,
        )
        device_untyped = PhysicalDevice.from_base(
            DeviceBase(id="d2", name="Untyped", config={}),
            driver=driver,
            transport=mock_transport_client,
        )
        registry = DeviceRegistry(
            {
                device_typed.id: device_typed,
                device_untyped.id: device_untyped,
            },
            resolve_driver=_make_driver_resolver(thermostat_driver, driver),
            resolve_transport=_make_transport_resolver(mock_transport_client),
            on_attribute_update=on_attribute_update,
        )

        result = registry.list_all(types=["thermostat"])

        assert len(result) == 1
        assert result[0].id == "d1"

    def test_list_filter_no_match(self, device_registry):
        result = device_registry.list_all(types=["unknown"])
        assert result == []

    def test_list_filter_by_ids(
        self,
        thermostat_driver,
        driver,
        mock_transport_client,
        on_attribute_update,
    ):
        d_thermo = PhysicalDevice.from_base(
            DeviceBase(id="d_thermo", name="Thermostat", config={}),
            driver=thermostat_driver,
            transport=mock_transport_client,
        )
        d_other = PhysicalDevice.from_base(
            DeviceBase(id="d_other", name="Other", config={}),
            driver=driver,
            transport=mock_transport_client,
        )
        registry = DeviceRegistry(
            {d_thermo.id: d_thermo, d_other.id: d_other},
            resolve_driver=_make_driver_resolver(thermostat_driver, driver),
            resolve_transport=_make_transport_resolver(mock_transport_client),
            on_attribute_update=on_attribute_update,
        )

        result = registry.list_all(ids=["d_thermo"])
        assert len(result) == 1
        assert result[0].id == "d_thermo"

    def test_list_ids_unknown_silently_skipped(
        self,
        thermostat_driver,
        mock_transport_client,
        on_attribute_update,
    ):
        d_thermo = PhysicalDevice.from_base(
            DeviceBase(id="d_thermo", name="Thermostat", config={}),
            driver=thermostat_driver,
            transport=mock_transport_client,
        )
        registry = DeviceRegistry(
            {d_thermo.id: d_thermo},
            resolve_driver=_make_driver_resolver(thermostat_driver),
            resolve_transport=_make_transport_resolver(mock_transport_client),
            on_attribute_update=on_attribute_update,
        )
        assert registry.list_all(ids=["unknown"]) == []

    def test_list_filter_writable_attribute(
        self,
        thermostat_driver,
        driver,
        mock_transport_client,
        on_attribute_update,
    ):
        d_thermo = PhysicalDevice.from_base(
            DeviceBase(id="d_thermo", name="Thermostat", config={}),
            driver=thermostat_driver,
            transport=mock_transport_client,
        )
        d_other = PhysicalDevice.from_base(
            DeviceBase(id="d_other", name="Other", config={}),
            driver=driver,
            transport=mock_transport_client,
        )
        registry = DeviceRegistry(
            {d_thermo.id: d_thermo, d_other.id: d_other},
            resolve_driver=_make_driver_resolver(thermostat_driver, driver),
            resolve_transport=_make_transport_resolver(mock_transport_client),
            on_attribute_update=on_attribute_update,
        )

        result = registry.list_all(writable_attribute="temperature_setpoint")
        ids = {d.id for d in result}
        assert ids == {"d_thermo", "d_other"}

    def test_list_filter_read_only_attribute_excluded(
        self,
        thermostat_driver,
        mock_transport_client,
        on_attribute_update,
    ):
        d_thermo = PhysicalDevice.from_base(
            DeviceBase(id="d_thermo", name="Thermostat", config={}),
            driver=thermostat_driver,
            transport=mock_transport_client,
        )
        registry = DeviceRegistry(
            {d_thermo.id: d_thermo},
            resolve_driver=_make_driver_resolver(thermostat_driver),
            resolve_transport=_make_transport_resolver(mock_transport_client),
            on_attribute_update=on_attribute_update,
        )
        assert registry.list_all(writable_attribute="temperature") == []

    def test_list_filters_stacked(
        self,
        thermostat_driver,
        driver,
        mock_transport_client,
        on_attribute_update,
    ):
        d_thermo = PhysicalDevice.from_base(
            DeviceBase(id="d_thermo", name="Thermostat", config={}),
            driver=thermostat_driver,
            transport=mock_transport_client,
        )
        d_other = PhysicalDevice.from_base(
            DeviceBase(id="d_other", name="Other", config={}),
            driver=driver,
            transport=mock_transport_client,
        )
        registry = DeviceRegistry(
            {d_thermo.id: d_thermo, d_other.id: d_other},
            resolve_driver=_make_driver_resolver(thermostat_driver, driver),
            resolve_transport=_make_transport_resolver(mock_transport_client),
            on_attribute_update=on_attribute_update,
        )

        result = registry.list_all(
            ids=["d_thermo", "d_other"],
            types=["thermostat"],
            writable_attribute="temperature_setpoint",
        )
        assert len(result) == 1
        assert result[0].id == "d_thermo"

    def test_list_filter_writable_attribute_type_match(
        self,
        thermostat_driver,
        mock_transport_client,
        on_attribute_update,
    ):
        d_thermo = PhysicalDevice.from_base(
            DeviceBase(id="d_thermo", name="Thermostat", config={}),
            driver=thermostat_driver,
            transport=mock_transport_client,
        )
        registry = DeviceRegistry(
            {d_thermo.id: d_thermo},
            resolve_driver=_make_driver_resolver(thermostat_driver),
            resolve_transport=_make_transport_resolver(mock_transport_client),
            on_attribute_update=on_attribute_update,
        )
        result = registry.list_all(
            writable_attribute="temperature_setpoint",
            writable_attribute_type=DataType.FLOAT,
        )
        assert len(result) == 1

    def test_list_filter_by_tags_match(
        self,
        driver,
        mock_transport_client,
        on_attribute_update,
    ):
        d1 = PhysicalDevice.from_base(
            DeviceBase(id="d1", name="D1", config={}),
            driver=driver,
            transport=mock_transport_client,
        )
        d1.tags = {"asset_id": ["floor1"]}
        d2 = PhysicalDevice.from_base(
            DeviceBase(id="d2", name="D2", config={}),
            driver=driver,
            transport=mock_transport_client,
        )
        d2.tags = {"asset_id": ["floor2"]}
        registry = DeviceRegistry(
            {d1.id: d1, d2.id: d2},
            resolve_driver=_make_driver_resolver(driver),
            resolve_transport=_make_transport_resolver(mock_transport_client),
            on_attribute_update=on_attribute_update,
        )
        result = registry.list_all(tags={"asset_id": ["floor1"]})
        assert len(result) == 1
        assert result[0].id == "d1"

    def test_list_filter_by_tags_no_match(
        self,
        driver,
        mock_transport_client,
        on_attribute_update,
    ):
        d1 = PhysicalDevice.from_base(
            DeviceBase(id="d1", name="D1", config={}),
            driver=driver,
            transport=mock_transport_client,
        )
        d1.tags = {"asset_id": ["floor1"]}
        registry = DeviceRegistry(
            {d1.id: d1},
            resolve_driver=_make_driver_resolver(driver),
            resolve_transport=_make_transport_resolver(mock_transport_client),
            on_attribute_update=on_attribute_update,
        )
        assert registry.list_all(tags={"asset_id": ["floor2"]}) == []

    def test_list_filter_tags_and_across_keys(
        self,
        driver,
        mock_transport_client,
        on_attribute_update,
    ):
        d1 = PhysicalDevice.from_base(
            DeviceBase(id="d1", name="D1", config={}),
            driver=driver,
            transport=mock_transport_client,
        )
        d1.tags = {"asset_id": ["floor1"], "region": ["north"]}
        d2 = PhysicalDevice.from_base(
            DeviceBase(id="d2", name="D2", config={}),
            driver=driver,
            transport=mock_transport_client,
        )
        d2.tags = {"asset_id": ["floor1"], "region": ["south"]}
        registry = DeviceRegistry(
            {d1.id: d1, d2.id: d2},
            resolve_driver=_make_driver_resolver(driver),
            resolve_transport=_make_transport_resolver(mock_transport_client),
            on_attribute_update=on_attribute_update,
        )
        result = registry.list_all(tags={"asset_id": ["floor1"], "region": ["north"]})
        assert len(result) == 1
        assert result[0].id == "d1"

    def test_list_filter_tags_empty_returns_all(self, device_registry):
        result = device_registry.list_all(tags={})
        assert len(result) == 1

    def test_list_filter_writable_attribute_type_mismatch(
        self,
        thermostat_driver,
        mock_transport_client,
        on_attribute_update,
    ):
        d_thermo = PhysicalDevice.from_base(
            DeviceBase(id="d_thermo", name="Thermostat", config={}),
            driver=thermostat_driver,
            transport=mock_transport_client,
        )
        registry = DeviceRegistry(
            {d_thermo.id: d_thermo},
            resolve_driver=_make_driver_resolver(thermostat_driver),
            resolve_transport=_make_transport_resolver(mock_transport_client),
            on_attribute_update=on_attribute_update,
        )
        assert (
            registry.list_all(
                writable_attribute="temperature_setpoint",
                writable_attribute_type=DataType.BOOL,
            )
            == []
        )


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
        assert isinstance(device, PhysicalDevice)
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


class TestDeviceRegistryAddVirtual:
    @pytest.mark.asyncio
    async def test_add_virtual_device_ok(self, empty_registry):
        create = VirtualDeviceCreate(
            name="Sensor",
            attributes=[
                AttributeCreate(
                    name="temperature",
                    data_type=DataType.FLOAT,
                    read_write_mode="read",
                ),
            ],
        )
        device = await empty_registry.add(create)
        assert isinstance(device, VirtualDevice)
        assert device.name == "Sensor"
        assert "temperature" in device.attributes
        assert device.id in empty_registry.ids

    @pytest.mark.asyncio
    async def test_add_virtual_device_empty_attributes_raises(self, empty_registry):
        create = VirtualDeviceCreate(name="Bad", attributes=[])
        with pytest.raises(InvalidError):
            await empty_registry.add(create)

    @pytest.mark.asyncio
    async def test_add_virtual_device_duplicate_attributes_raises(self, empty_registry):
        create = VirtualDeviceCreate(
            name="Bad",
            attributes=[
                AttributeCreate(
                    name="temp",
                    data_type=DataType.FLOAT,
                    read_write_mode="read",
                ),
                AttributeCreate(
                    name="temp",
                    data_type=DataType.INT,
                    read_write_mode="read",
                ),
            ],
        )
        with pytest.raises(InvalidError):
            await empty_registry.add(create)

    @pytest.mark.asyncio
    async def test_add_virtual_device_invalid_standard_schema_raises(
        self, empty_registry
    ):
        create = VirtualDeviceCreate(
            name="Bad Thermo",
            type="thermostat",
            attributes=[
                AttributeCreate(
                    name="temperature",
                    data_type=DataType.FLOAT,
                    read_write_mode="read",
                ),
            ],
        )
        with pytest.raises(InvalidError):
            await empty_registry.add(create)

    @pytest.mark.asyncio
    async def test_add_sets_on_update_callback(
        self, empty_registry, on_attribute_update
    ):
        create = VirtualDeviceCreate(
            name="V",
            attributes=[
                AttributeCreate(
                    name="x",
                    data_type=DataType.INT,
                    read_write_mode="read",
                ),
            ],
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
    async def test_update_tags(self, device_registry, device):
        result = await device_registry.update(
            device.id, DeviceUpdate(tags={"asset_id": ["floor1"]})
        )
        assert result.tags == {"asset_id": ["floor1"]}

    @pytest.mark.asyncio
    async def test_update_tags_replace(self, device_registry, device):
        device.tags = {"asset_id": ["floor1"]}
        result = await device_registry.update(
            device.id, DeviceUpdate(tags={"asset_id": []})
        )
        assert result.tags == {"asset_id": []}

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
        assert isinstance(result, PhysicalDevice)
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
        assert isinstance(result, PhysicalDevice)
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
        assert isinstance(result, PhysicalDevice)
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
        device.attributes["temperature"]._update_value(42.0)
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
        assert isinstance(result, PhysicalDevice)
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


class TestDeviceRegistryUpdateVirtual:
    @pytest.fixture
    def registry_with_virtual(self, driver, mock_transport_client, on_attribute_update):
        vd = VirtualDevice(
            id="vd1",
            name="Original",
            attributes={
                "temperature": Attribute.create(
                    "temperature", DataType.FLOAT, {"read"}
                ),
                "humidity": Attribute.create("humidity", DataType.FLOAT, {"read"}),
            },
        )
        return DeviceRegistry(
            {vd.id: vd},
            resolve_driver=_make_driver_resolver(driver),
            resolve_transport=_make_transport_resolver(mock_transport_client),
            on_attribute_update=on_attribute_update,
        )

    @pytest.mark.asyncio
    async def test_update_virtual_name(self, registry_with_virtual):
        result = await registry_with_virtual.update(
            "vd1", DeviceUpdate(name="New Name")
        )
        assert result.name == "New Name"

    @pytest.mark.asyncio
    async def test_update_virtual_add_attribute(self, registry_with_virtual):
        result = await registry_with_virtual.update(
            "vd1",
            DeviceUpdate(
                attributes=[
                    AttributeCreate(
                        name="temperature",
                        data_type=DataType.FLOAT,
                        read_write_mode="read",
                    ),
                    AttributeCreate(
                        name="humidity",
                        data_type=DataType.FLOAT,
                        read_write_mode="read",
                    ),
                    AttributeCreate(
                        name="pressure",
                        data_type=DataType.FLOAT,
                        read_write_mode="read",
                    ),
                ]
            ),
        )
        assert "pressure" in result.attributes

    @pytest.mark.asyncio
    async def test_update_virtual_remove_attribute(self, registry_with_virtual):
        result = await registry_with_virtual.update(
            "vd1",
            DeviceUpdate(
                attributes=[
                    AttributeCreate(
                        name="temperature",
                        data_type=DataType.FLOAT,
                        read_write_mode="read",
                    ),
                ]
            ),
        )
        assert "humidity" not in result.attributes

    @pytest.mark.asyncio
    async def test_update_virtual_reject_type_change(self, registry_with_virtual):
        with pytest.raises(InvalidError):
            await registry_with_virtual.update(
                "vd1",
                DeviceUpdate(
                    attributes=[
                        AttributeCreate(
                            name="temperature",
                            data_type=DataType.INT,
                            read_write_mode="read",
                        ),
                    ]
                ),
            )


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
    async def test_write_virtual_attribute_ok(
        self, driver, mock_transport_client, on_attribute_update
    ):
        vd = VirtualDevice(
            id="vd1",
            name="V",
            attributes={
                "value": Attribute.create("value", DataType.FLOAT, {"read", "write"}),
            },
        )
        registry = DeviceRegistry(
            {vd.id: vd},
            resolve_driver=_make_driver_resolver(driver),
            resolve_transport=_make_transport_resolver(mock_transport_client),
            on_attribute_update=on_attribute_update,
        )
        result = await registry.write_attribute("vd1", "value", 42.0)
        assert isinstance(result, Attribute)
        assert result.current_value == 42.0


class TestDeviceRegistryRebuild:
    def test_rebuild_physical_device(
        self,
        device_registry,
        device,
        other_http_driver,
        mock_transport_client,
    ):
        result = device_registry.rebuild_physical_device(
            device, other_http_driver, mock_transport_client
        )
        assert isinstance(result, PhysicalDevice)
        assert result.id == device.id
        assert result.driver_id == other_http_driver.id

    def test_rebuild_preserves_values(
        self,
        device_registry,
        device,
        other_http_driver,
        mock_transport_client,
    ):
        device.attributes["temperature"]._update_value(25.5)
        result = device_registry.rebuild_physical_device(
            device, other_http_driver, mock_transport_client
        )
        assert result.attributes["temperature"].current_value == 25.5


class TestDeviceRegistryPersistence:
    @pytest.mark.asyncio
    async def test_add_persists_to_storage(
        self, driver, mock_transport_client, on_attribute_update
    ):
        storage = AsyncMock(spec=StorageBackend)
        registry = DeviceRegistry(
            resolve_driver=_make_driver_resolver(driver),
            resolve_transport=_make_transport_resolver(mock_transport_client),
            on_attribute_update=on_attribute_update,
            storage=storage,
        )
        create = VirtualDeviceCreate(
            name="V",
            attributes=[
                AttributeCreate(
                    name="x", data_type=DataType.FLOAT, read_write_mode="read"
                ),
            ],
        )
        await registry.add(create)
        storage.write.assert_called_once()

    @pytest.mark.asyncio
    async def test_register_persists_to_storage(
        self, driver, mock_transport_client, on_attribute_update
    ):
        storage = AsyncMock(spec=StorageBackend)
        registry = DeviceRegistry(
            resolve_driver=_make_driver_resolver(driver),
            resolve_transport=_make_transport_resolver(mock_transport_client),
            on_attribute_update=on_attribute_update,
            storage=storage,
        )
        vd = VirtualDevice(
            id="vd1",
            name="V",
            attributes={
                "x": Attribute.create("x", DataType.FLOAT, {"read"}),
            },
        )
        await registry.register(vd)
        storage.write.assert_called_once()

    @pytest.mark.asyncio
    async def test_update_persists_to_storage(
        self, device, driver, mock_transport_client, on_attribute_update
    ):
        storage = AsyncMock(spec=StorageBackend)
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
        storage = AsyncMock(spec=StorageBackend)
        registry = DeviceRegistry(
            {device.id: device},
            resolve_driver=_make_driver_resolver(driver),
            resolve_transport=_make_transport_resolver(mock_transport_client),
            on_attribute_update=on_attribute_update,
            storage=storage,
        )
        await registry.remove(device.id)
        storage.delete.assert_called_once_with(device.id)
