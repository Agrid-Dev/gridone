from __future__ import annotations

import logging
from collections.abc import Callable, Iterable
from typing import TYPE_CHECKING

from devices_manager.dto import (
    PhysicalDeviceCreate,
    device_to_public,
)
from devices_manager.storage import NullStorageBackend
from models.errors import InvalidError, NotFoundError

from .device import Attribute, CoreDevice, DeviceBase, PhysicalDevice, VirtualDevice
from .id import gen_id
from .standard_schemas.validate import validate_standard_schema

if TYPE_CHECKING:
    from devices_manager.dto import (
        Device,
        DeviceCreate,
        DeviceUpdate,
        VirtualDeviceCreate,
    )
    from devices_manager.storage import StorageBackend
    from devices_manager.types import AttributeValueType, DataType

    from .driver import Driver
    from .transports import TransportClient

logger = logging.getLogger(__name__)

AttributeUpdateCallback = Callable[[CoreDevice, str, Attribute], None]


DriverResolver = Callable[[str], "Driver"]
TransportResolver = Callable[[str], "TransportClient"]


class DeviceRegistry:
    """In-memory registry for devices with optional persistence."""

    _devices: dict[str, CoreDevice]
    _resolve_driver: DriverResolver
    _resolve_transport: TransportResolver
    _on_attribute_update: AttributeUpdateCallback | None
    _storage: StorageBackend[Device]

    def __init__(
        self,
        devices: dict[str, CoreDevice] | None = None,
        *,
        resolve_driver: DriverResolver,
        resolve_transport: TransportResolver,
        on_attribute_update: AttributeUpdateCallback | None = None,
        storage: StorageBackend[Device] | None = None,
    ) -> None:
        self._devices = devices if devices is not None else {}
        self._resolve_driver = resolve_driver
        self._resolve_transport = resolve_transport
        self._on_attribute_update = on_attribute_update
        self._storage = storage or NullStorageBackend()
        for device in self._devices.values():
            device.on_update = self._on_attribute_update

    @property
    def all(self) -> dict[str, CoreDevice]:
        return self._devices

    @property
    def ids(self) -> set[str]:
        return set(self._devices.keys())

    def _get_or_raise(self, device_id: str) -> CoreDevice:
        try:
            return self._devices[device_id]
        except KeyError as e:
            msg = f"Device {device_id} not found"
            raise NotFoundError(msg) from e

    def get(self, device_id: str) -> CoreDevice:
        return self._get_or_raise(device_id)

    def get_dto(self, device_id: str) -> Device:
        device = self._get_or_raise(device_id)
        return device_to_public(device)

    def list_all(  # noqa: PLR0913
        self,
        *,
        ids: Iterable[str] | None = None,
        types: list[str] | None = None,
        writable_attribute: str | None = None,
        writable_attribute_type: DataType | None = None,
        tags: dict[str, list[str]] | None = None,
        is_faulty: bool | None = None,
    ) -> list[Device]:
        devices: Iterable[CoreDevice] = self._devices.values()
        if ids is not None:
            ids_set = set(ids)
            devices = [d for d in devices if d.id in ids_set]
        if types is not None:
            types_set = set(types)
            devices = [d for d in devices if d.type in types_set]
        if writable_attribute is not None:
            devices = [
                d
                for d in devices
                if d.can_write(writable_attribute, data_type=writable_attribute_type)
            ]
        if tags is not None:
            for key, values in tags.items():
                values_set = set(values)
                devices = [d for d in devices if d.tags.get(key) in values_set]
        if is_faulty is not None:
            devices = [d for d in devices if d.is_faulty == is_faulty]
        return [device_to_public(d) for d in devices]

    async def register(self, device: CoreDevice) -> None:
        """Register device in memory and persist."""
        if device.id in self._devices:
            msg = f"Device with id {device.id} already exists"
            raise ValueError(msg)
        self._devices[device.id] = device
        await self._storage.write(device.id, device_to_public(device))
        logger.info("Successfully registered device '%s'", device.id)

    def _validate_device_config(self, device_config: dict, driver: Driver) -> None:
        for field in driver.device_config_required:
            if field.required and field.name not in device_config:
                msg = f"Device config misses driver required field '{field.name}'"
                raise InvalidError(msg)

    @staticmethod
    def _check_transport_compat(driver: Driver, transport: TransportClient) -> None:
        if driver.transport != transport.protocol:
            msg = f"Transport {transport.id} is not compatible with driver {driver.id}"
            raise ValueError(msg)

    def _create_physical_device(
        self, device_create: PhysicalDeviceCreate
    ) -> PhysicalDevice:
        driver = self._resolve_driver(device_create.driver_id)
        self._validate_device_config(device_create.config, driver)
        transport = self._resolve_transport(device_create.transport_id)
        self._check_transport_compat(driver, transport)
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
        self, device_create: VirtualDeviceCreate
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

    async def add(self, device_create: DeviceCreate) -> CoreDevice:
        """Create a device, register it in memory, and persist.

        Returns the CoreDevice so the caller can handle lifecycle.
        """
        if isinstance(device_create, PhysicalDeviceCreate):
            device = self._create_physical_device(device_create)
        else:
            device = self._create_virtual_device(device_create)
        await self.register(device)
        logger.info(
            "Successfully created device '%s' (id: %s)",
            device_create.name,
            device.id,
        )
        return device

    def _resolve_driver_or_none(self, driver_id: str | None) -> Driver | None:
        if driver_id is None:
            return None
        return self._resolve_driver(driver_id)

    def _resolve_transport_or_none(
        self, transport_id: str | None
    ) -> TransportClient | None:
        if transport_id is None:
            return None
        return self._resolve_transport(transport_id)

    def rebuild_physical_device(
        self,
        device: PhysicalDevice,
        driver: Driver,
        transport: TransportClient,
    ) -> PhysicalDevice:
        """Rebuild a device with new driver/transport.

        Preserves existing attribute values and tags.
        """
        initial_values = {
            name: attr.current_value
            for name, attr in device.attributes.items()
            if attr.current_value is not None
        }
        new_device = PhysicalDevice.from_base(
            DeviceBase(id=device.id, name=device.name, config=device.config),
            driver=driver,
            transport=transport,
            initial_values=initial_values,
            on_update=self._on_attribute_update,
        )
        new_device.tags = device.tags
        return new_device

    def _mutate_virtual_attributes(
        self, device: VirtualDevice, device_update: DeviceUpdate
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

    async def update(self, device_id: str, device_update: DeviceUpdate) -> CoreDevice:
        """Update a device in-place, rebuild if needed, and persist.

        Returns the (potentially rebuilt) Device so the caller can
        handle lifecycle side-effects (polling restart, listener init).
        """
        device = self._get_or_raise(device_id)

        if isinstance(device, VirtualDevice):
            if device_update.name is not None:
                device.name = device_update.name
            self._mutate_virtual_attributes(device, device_update)
            await self._storage.write(device_id, device_to_public(device))
            return device

        assert isinstance(device, PhysicalDevice)  # noqa: S101
        new_driver = self._resolve_driver_or_none(device_update.driver_id)
        new_transport = self._resolve_transport_or_none(device_update.transport_id)
        effective_driver = new_driver or device.driver
        effective_transport = new_transport or device.transport

        self._check_transport_compat(effective_driver, effective_transport)

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

        result = self._devices[device_id]
        await self._storage.write(device_id, device_to_public(result))
        return result

    async def remove(self, device_id: str) -> None:
        """Remove a device from memory and storage."""
        self._get_or_raise(device_id)
        del self._devices[device_id]
        await self._storage.delete(device_id)

    async def set_tag(self, device_id: str, key: str, value: str) -> CoreDevice:
        device = self._get_or_raise(device_id)
        device.tags[key] = value
        await self._storage.write(device_id, device_to_public(device))
        return device

    async def delete_tag(self, device_id: str, key: str) -> CoreDevice:
        device = self._get_or_raise(device_id)
        device.tags.pop(key, None)
        await self._storage.write(device_id, device_to_public(device))
        return device

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
