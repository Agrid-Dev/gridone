from __future__ import annotations

from typing import TYPE_CHECKING
from unittest.mock import MagicMock

import pytest

from devices_manager.core.device import (
    Attribute,
    DeviceBase,
    PhysicalDevice,
    VirtualDevice,
)
from devices_manager.core.device_registry import DeviceRegistry
from devices_manager.dto import (
    AttributeCreateDTO,
    DeviceDTO,
    DeviceUpdateDTO,
    VirtualDeviceCreateDTO,
)
from devices_manager.dto import (
    PhysicalDeviceCreateDTO as DeviceCreateDTO,
)
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
        assert isinstance(dto, DeviceDTO)
        assert dto.id == device.id

    def test_get_dto_not_found(self, device_registry):
        with pytest.raises(NotFoundError):
            device_registry.get_dto("unknown")


class TestDeviceRegistryList:
    def test_list_all(self, device_registry):
        devices = device_registry.list_all()
        assert len(devices) == 1
        assert all(isinstance(d, DeviceDTO) for d in devices)

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

        result = registry.list_all(device_type="thermostat")

        assert len(result) == 1
        assert result[0].id == "d1"

    def test_list_filter_no_match(self, device_registry):
        result = device_registry.list_all(device_type="unknown")
        assert result == []


class TestDeviceRegistryRegister:
    def test_register_ok(self, empty_registry, device):
        empty_registry.register(device)
        assert device.id in empty_registry.ids

    def test_register_duplicate_raises(self, device_registry, device):
        with pytest.raises(ValueError):  # noqa: PT011
            device_registry.register(device)


class TestDeviceRegistryAddPhysical:
    def test_add_physical_device_ok(
        self, empty_registry, driver, mock_transport_client
    ):
        create = DeviceCreateDTO(
            name="New Device",
            config={"some_id": "abc"},
            driver_id=driver.id,
            transport_id=mock_transport_client.id,
        )
        device = empty_registry.add(create)
        assert isinstance(device, PhysicalDevice)
        assert device.name == "New Device"
        assert device.id in empty_registry.ids

    def test_add_physical_device_driver_not_found(
        self, empty_registry, mock_transport_client
    ):
        create = DeviceCreateDTO(
            name="Bad",
            config={"some_id": "abc"},
            driver_id="unknown_driver",
            transport_id=mock_transport_client.id,
        )
        with pytest.raises(NotFoundError):
            empty_registry.add(create)

    def test_add_physical_device_transport_not_found(self, empty_registry, driver):
        create = DeviceCreateDTO(
            name="Bad",
            config={"some_id": "abc"},
            driver_id=driver.id,
            transport_id="unknown_transport",
        )
        with pytest.raises(NotFoundError):
            empty_registry.add(create)

    def test_add_physical_device_incompatible_transport(
        self, driver, mock_push_transport_client, on_attribute_update
    ):
        registry = DeviceRegistry(
            resolve_driver=_make_driver_resolver(driver),
            resolve_transport=_make_transport_resolver(mock_push_transport_client),
            on_attribute_update=on_attribute_update,
        )
        create = DeviceCreateDTO(
            name="Bad",
            config={"some_id": "abc"},
            driver_id=driver.id,
            transport_id=mock_push_transport_client.id,
        )
        with pytest.raises(ValueError):  # noqa: PT011
            registry.add(create)

    def test_add_physical_device_invalid_config(
        self, empty_registry, driver, mock_transport_client
    ):
        create = DeviceCreateDTO(
            name="Bad",
            config={},
            driver_id=driver.id,
            transport_id=mock_transport_client.id,
        )
        with pytest.raises(InvalidError):
            empty_registry.add(create)

    def test_add_sets_on_update_callback(
        self,
        empty_registry,
        driver,
        mock_transport_client,
        on_attribute_update,
    ):
        create = DeviceCreateDTO(
            name="Device",
            config={"some_id": "abc"},
            driver_id=driver.id,
            transport_id=mock_transport_client.id,
        )
        device = empty_registry.add(create)
        assert device.on_update is on_attribute_update


class TestDeviceRegistryAddVirtual:
    def test_add_virtual_device_ok(self, empty_registry):
        create = VirtualDeviceCreateDTO(
            name="Sensor",
            attributes=[
                AttributeCreateDTO(
                    name="temperature",
                    data_type=DataType.FLOAT,
                    read_write_mode="read",
                ),
            ],
        )
        device = empty_registry.add(create)
        assert isinstance(device, VirtualDevice)
        assert device.name == "Sensor"
        assert "temperature" in device.attributes
        assert device.id in empty_registry.ids

    def test_add_virtual_device_empty_attributes_raises(self, empty_registry):
        create = VirtualDeviceCreateDTO(name="Bad", attributes=[])
        with pytest.raises(InvalidError):
            empty_registry.add(create)

    def test_add_virtual_device_duplicate_attributes_raises(self, empty_registry):
        create = VirtualDeviceCreateDTO(
            name="Bad",
            attributes=[
                AttributeCreateDTO(
                    name="temp",
                    data_type=DataType.FLOAT,
                    read_write_mode="read",
                ),
                AttributeCreateDTO(
                    name="temp",
                    data_type=DataType.INT,
                    read_write_mode="read",
                ),
            ],
        )
        with pytest.raises(InvalidError):
            empty_registry.add(create)

    def test_add_virtual_device_invalid_standard_schema_raises(self, empty_registry):
        create = VirtualDeviceCreateDTO(
            name="Bad Thermo",
            type="thermostat",
            attributes=[
                AttributeCreateDTO(
                    name="temperature",
                    data_type=DataType.FLOAT,
                    read_write_mode="read",
                ),
            ],
        )
        with pytest.raises(InvalidError):
            empty_registry.add(create)

    def test_add_sets_on_update_callback(self, empty_registry, on_attribute_update):
        create = VirtualDeviceCreateDTO(
            name="V",
            attributes=[
                AttributeCreateDTO(
                    name="x",
                    data_type=DataType.INT,
                    read_write_mode="read",
                ),
            ],
        )
        device = empty_registry.add(create)
        assert device.on_update is on_attribute_update


class TestDeviceRegistryUpdate:
    def test_update_name(self, device_registry, device):
        result = device_registry.update(device.id, DeviceUpdateDTO(name="New Name"))
        assert result.name == "New Name"

    def test_update_empty_payload(self, device_registry, device):
        original_name = device.name
        result = device_registry.update(device.id, DeviceUpdateDTO())
        assert result.name == original_name

    def test_update_not_found(self, device_registry):
        with pytest.raises(NotFoundError):
            device_registry.update("unknown", DeviceUpdateDTO(name="X"))

    def test_update_config_ok(self, device_registry, device):
        new_config = {"some_id": "xyz"}
        result = device_registry.update(device.id, DeviceUpdateDTO(config=new_config))
        assert isinstance(result, PhysicalDevice)
        assert result.config == new_config

    def test_update_config_invalid(self, device_registry, device):
        with pytest.raises(InvalidError):
            device_registry.update(device.id, DeviceUpdateDTO(config={}))

    def test_update_driver_not_found(self, device_registry, device):
        with pytest.raises(NotFoundError):
            device_registry.update(device.id, DeviceUpdateDTO(driver_id="unknown"))

    def test_update_transport_not_found(self, device_registry, device):
        with pytest.raises(NotFoundError):
            device_registry.update(device.id, DeviceUpdateDTO(transport_id="unknown"))

    def test_update_driver_ok(
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
        result = registry.update(
            device.id,
            DeviceUpdateDTO(driver_id=other_http_driver.id),
        )
        assert isinstance(result, PhysicalDevice)
        assert result.driver_id == other_http_driver.id
        assert "power" in result.attributes

    def test_update_driver_incompatible(
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
            registry.update(
                device.id,
                DeviceUpdateDTO(driver_id=driver_w_push_transport.id),
            )

    def test_update_transport_ok(
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
        result = registry.update(
            device.id,
            DeviceUpdateDTO(transport_id=second_mock_transport_client.id),
        )
        assert isinstance(result, PhysicalDevice)
        assert result.transport_id == second_mock_transport_client.id

    def test_update_driver_preserves_attribute_values(
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
        result = registry.update(
            device.id,
            DeviceUpdateDTO(driver_id=other_http_driver.id),
        )
        assert isinstance(result, PhysicalDevice)
        assert result.attributes["temperature"].current_value == 42.0

    def test_rebuild_replaces_device_in_registry(
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
        result = registry.update(
            device.id,
            DeviceUpdateDTO(driver_id=other_http_driver.id),
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

    def test_update_virtual_name(self, registry_with_virtual):
        result = registry_with_virtual.update("vd1", DeviceUpdateDTO(name="New Name"))
        assert result.name == "New Name"

    def test_update_virtual_add_attribute(self, registry_with_virtual):
        result = registry_with_virtual.update(
            "vd1",
            DeviceUpdateDTO(
                attributes=[
                    AttributeCreateDTO(
                        name="temperature",
                        data_type=DataType.FLOAT,
                        read_write_mode="read",
                    ),
                    AttributeCreateDTO(
                        name="humidity",
                        data_type=DataType.FLOAT,
                        read_write_mode="read",
                    ),
                    AttributeCreateDTO(
                        name="pressure",
                        data_type=DataType.FLOAT,
                        read_write_mode="read",
                    ),
                ]
            ),
        )
        assert "pressure" in result.attributes

    def test_update_virtual_remove_attribute(self, registry_with_virtual):
        result = registry_with_virtual.update(
            "vd1",
            DeviceUpdateDTO(
                attributes=[
                    AttributeCreateDTO(
                        name="temperature",
                        data_type=DataType.FLOAT,
                        read_write_mode="read",
                    ),
                ]
            ),
        )
        assert "humidity" not in result.attributes

    def test_update_virtual_reject_type_change(self, registry_with_virtual):
        with pytest.raises(InvalidError):
            registry_with_virtual.update(
                "vd1",
                DeviceUpdateDTO(
                    attributes=[
                        AttributeCreateDTO(
                            name="temperature",
                            data_type=DataType.INT,
                            read_write_mode="read",
                        ),
                    ]
                ),
            )


class TestDeviceRegistryRemove:
    def test_remove_ok(self, device_registry, device):
        device_registry.remove(device.id)
        assert device.id not in device_registry.ids

    def test_remove_not_found(self, device_registry):
        with pytest.raises(NotFoundError):
            device_registry.remove("unknown")


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
