from __future__ import annotations

import logging
from collections.abc import Callable
from typing import TYPE_CHECKING

from devices_manager.dto import (
    PhysicalDeviceCreateDTO,
    device_core_to_dto,
)
from models.errors import InvalidError, NotFoundError

from .device import Attribute, Device, DeviceBase, PhysicalDevice, VirtualDevice
from .driver_registry import DriverRegistry
from .id import gen_id
from .standard_schemas.validate import validate_standard_schema

if TYPE_CHECKING:
    from devices_manager.dto import (
        DeviceCreateDTO,
        DeviceDTO,
        DeviceUpdateDTO,
        VirtualDeviceCreateDTO,
    )
    from devices_manager.types import AttributeValueType

    from .driver import Driver
    from .transport_registry import TransportRegistry
    from .transports import TransportClient

logger = logging.getLogger(__name__)

AttributeUpdateCallback = Callable[[Device, str, Attribute], None]


class DeviceRegistry:
    """Pure in-memory registry for devices."""

    _devices: dict[str, Device]
    _driver_registry: DriverRegistry
    _transport_registry: TransportRegistry
    _on_attribute_update: AttributeUpdateCallback | None

    def __init__(
        self,
        devices: dict[str, Device] | None = None,
        *,
        driver_registry: DriverRegistry,
        transport_registry: TransportRegistry,
        on_attribute_update: AttributeUpdateCallback | None = None,
    ) -> None:
        self._devices = devices if devices is not None else {}
        self._driver_registry = driver_registry
        self._transport_registry = transport_registry
        self._on_attribute_update = on_attribute_update
        for device in self._devices.values():
            device.on_update = self._on_attribute_update

    @property
    def all(self) -> dict[str, Device]:
        return self._devices

    @property
    def ids(self) -> set[str]:
        return set(self._devices.keys())

    def _get_or_raise(self, device_id: str) -> Device:
        try:
            return self._devices[device_id]
        except KeyError as e:
            msg = f"Device {device_id} not found"
            raise NotFoundError(msg) from e

    def get(self, device_id: str) -> Device:
        return self._get_or_raise(device_id)

    def get_dto(self, device_id: str) -> DeviceDTO:
        device = self._get_or_raise(device_id)
        return device_core_to_dto(device)

    def list_all(self, *, device_type: str | None = None) -> list[DeviceDTO]:
        devices = list(self._devices.values())
        if device_type is not None:
            devices = [d for d in devices if d.type == device_type]
        return [device_core_to_dto(device) for device in devices]

    def register(self, device: Device) -> None:
        """Register device in memory."""
        if device.id in self._devices:
            msg = f"Device with id {device.id} already exists"
            raise ValueError(msg)
        self._devices[device.id] = device
        logger.info("Successfully registered device '%s'", device.id)

    def _validate_device_config(self, device_config: dict, driver: Driver) -> None:
        for field in driver.device_config_required:
            if field.required and field.name not in device_config:
                msg = f"Device config misses driver required field '{field.name}'"
                raise InvalidError(msg)

    def _create_physical_device(
        self, device_create: PhysicalDeviceCreateDTO
    ) -> PhysicalDevice:
        driver = self._driver_registry.get(device_create.driver_id)
        self._validate_device_config(device_create.config, driver)
        transport = self._transport_registry.get(device_create.transport_id)
        DriverRegistry.check_transport_compat(driver, transport)
        base = DeviceBase(
            id=gen_id(), name=device_create.name, config=device_create.config
        )
        return PhysicalDevice.from_base(
            base,
            driver=driver,
            transport=transport,
            on_update=self._on_attribute_update,
        )

    def _create_virtual_device(
        self, device_create: VirtualDeviceCreateDTO
    ) -> VirtualDevice:
        if not device_create.attributes:
            msg = "Virtual device must have at least one attribute"
            raise InvalidError(msg)
        names = [a.name for a in device_create.attributes]
        if len(names) != len(set(names)):
            msg = "Duplicate attribute names in virtual device payload"
            raise InvalidError(msg)
        if device_create.type is not None:
            validate_standard_schema(device_create.type, device_create.attributes)  # ty: ignore[invalid-argument-type]
        attributes = {
            a.name: Attribute.create(a.name, a.data_type, {a.read_write_mode})
            for a in device_create.attributes
        }
        return VirtualDevice(
            id=gen_id(),
            name=device_create.name,
            type=device_create.type,
            attributes=attributes,
            on_update=self._on_attribute_update,
        )

    def add(self, device_create: DeviceCreateDTO) -> Device:
        """Create a device and register it in memory.

        Returns the core Device so the caller can handle lifecycle
        and persistence.
        """
        if isinstance(device_create, PhysicalDeviceCreateDTO):
            device = self._create_physical_device(device_create)
        else:
            device = self._create_virtual_device(device_create)
        self.register(device)
        logger.info(
            "Successfully created device '%s' (id: %s)",
            device_create.name,
            device.id,
        )
        return device

    def _resolve_driver(self, driver_id: str | None) -> Driver | None:
        if driver_id is None:
            return None
        return self._driver_registry.get(driver_id)

    def _resolve_transport(self, transport_id: str | None) -> TransportClient | None:
        if transport_id is None:
            return None
        return self._transport_registry.get(transport_id)

    def rebuild_physical_device(
        self,
        device: PhysicalDevice,
        driver: Driver,
        transport: TransportClient,
    ) -> PhysicalDevice:
        """Rebuild a device with new driver/transport.

        Preserves existing attribute values when possible.
        """
        initial_values = {
            name: attr.current_value
            for name, attr in device.attributes.items()
            if attr.current_value is not None
        }
        return PhysicalDevice.from_base(
            DeviceBase(id=device.id, name=device.name, config=device.config),
            driver=driver,
            transport=transport,
            initial_values=initial_values,
            on_update=self._on_attribute_update,
        )

    def _mutate_virtual_attributes(
        self, device: VirtualDevice, device_update: DeviceUpdateDTO
    ) -> None:
        if device_update.attributes is None:
            return
        incoming = {a.name: a for a in device_update.attributes}
        for name, attr_dto in incoming.items():
            existing = device.attributes.get(name)
            if existing is not None and existing.data_type != attr_dto.data_type:
                msg = f"Cannot change data_type of existing attribute '{name}'"
                raise InvalidError(msg)
        new_attributes = {
            name: (
                device.attributes[name]
                if name in device.attributes
                else Attribute.create(
                    attr_dto.name, attr_dto.data_type, {attr_dto.read_write_mode}
                )
            )
            for name, attr_dto in incoming.items()
        }
        if device.type is not None:
            validate_standard_schema(device.type, list(device_update.attributes))
        device.attributes = new_attributes

    def update(self, device_id: str, device_update: DeviceUpdateDTO) -> Device:
        """Update a device in-place, rebuild if needed.

        Returns the (potentially rebuilt) Device so the caller can
        handle lifecycle side-effects (polling restart, listener init, persistence).
        """
        device = self._get_or_raise(device_id)

        if isinstance(device, VirtualDevice):
            if device_update.name is not None:
                device.name = device_update.name
            self._mutate_virtual_attributes(device, device_update)
            return device

        assert isinstance(device, PhysicalDevice)  # noqa: S101
        new_driver = self._resolve_driver(device_update.driver_id)
        new_transport = self._resolve_transport(device_update.transport_id)
        effective_driver = new_driver or device.driver
        effective_transport = new_transport or device.transport

        DriverRegistry.check_transport_compat(effective_driver, effective_transport)

        if device_update.name is not None:
            device.name = device_update.name
        if device_update.config is not None:
            device.config = device_update.config

        if new_driver is not None:
            self._validate_device_config(device.config, new_driver)
        elif device_update.config is not None:
            self._validate_device_config(device_update.config, device.driver)

        if new_driver is not None or new_transport is not None:
            device = self.rebuild_physical_device(
                device, effective_driver, effective_transport
            )
            self._devices[device_id] = device

        return self._devices[device_id]

    def remove(self, device_id: str) -> None:
        """Remove a device from memory."""
        self._get_or_raise(device_id)
        del self._devices[device_id]

    async def write_attribute(
        self,
        device_id: str,
        attribute_name: str,
        value: AttributeValueType,
        *,
        confirm: bool = True,
    ) -> Attribute:
        device = self._get_or_raise(device_id)
        if attribute_name not in device.attributes:
            msg = f"Attribute '{attribute_name}' not found on device {device_id}"
            raise NotFoundError(msg)
        return await device.write_attribute_value(
            attribute_name, value, confirm=confirm
        )
