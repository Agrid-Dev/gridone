from __future__ import annotations

import logging
from collections.abc import Callable, Collection
from typing import TYPE_CHECKING

from devices_manager.dto import device_to_public
from devices_manager.storage.memory import MemoryDeviceStorage
from models.errors import InvalidError, NotFoundError
from models.ids import gen_id

from .device import (
    Attribute,
    AttributeListener,
    CoreDevice,
    DeviceBase,
)
from .device_filters import DeviceFilters

if TYPE_CHECKING:
    from devices_manager.core.device.event_log import AttributeLogs
    from devices_manager.core.driver.attribute_driver import AttributeDriver
    from devices_manager.dto import (
        Device,
        DeviceCreate,
        DeviceUpdate,
    )
    from devices_manager.storage import DeviceStorageBackend
    from devices_manager.types import AttributeValueType, DataType

    from .driver import Driver
    from .transports import TransportClient

logger = logging.getLogger(__name__)

DriverResolver = Callable[[str], "Driver"]
TransportResolver = Callable[[str], "TransportClient"]


class DeviceRegistry:
    """In-memory registry for devices with optional persistence."""

    _devices: dict[str, CoreDevice]
    _resolve_driver: DriverResolver
    _resolve_transport: TransportResolver
    _on_attribute_update: AttributeListener | None
    _storage: DeviceStorageBackend

    def __init__(
        self,
        devices: dict[str, CoreDevice] | None = None,
        *,
        resolve_driver: DriverResolver,
        resolve_transport: TransportResolver,
        storage: DeviceStorageBackend | None = None,
        on_attribute_update: AttributeListener | None = None,
    ) -> None:
        self._devices = devices if devices is not None else {}
        self._resolve_driver = resolve_driver
        self._resolve_transport = resolve_transport
        self._on_attribute_update = on_attribute_update
        self._storage = storage if storage is not None else MemoryDeviceStorage()
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
        ids: Collection[str] | None = None,
        types: list[str] | None = None,
        writable_attribute: str | None = None,
        writable_attribute_type: DataType | None = None,
        tags: dict[str, list[str]] | None = None,
        is_faulty: bool | None = None,
        search: str | None = None,
        driver_id: str | None = None,
        transport_id: str | None = None,
    ) -> list[Device]:
        filters = DeviceFilters(
            ids=ids,
            types=types,
            writable_attribute=writable_attribute,
            writable_attribute_type=writable_attribute_type,
            tags=tags,
            is_faulty=is_faulty,
            search=search,
            driver_id=driver_id,
            transport_id=transport_id,
        )
        return [
            device_to_public(d) for d in self._devices.values() if filters.matches(d)
        ]

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

    def _create_device(self, device_create: DeviceCreate) -> CoreDevice:
        driver = self._resolve_driver(device_create.driver_id)
        self._validate_device_config(device_create.config, driver)
        transport = self._resolve_transport(device_create.transport_id)
        self._check_transport_compat(driver, transport)
        base = DeviceBase(
            id=gen_id(), name=device_create.name, config=device_create.config
        )
        return CoreDevice.from_base(
            base,
            driver=driver,
            transport=transport,
            on_update=self._on_attribute_update,
        )

    async def add(self, device_create: DeviceCreate) -> CoreDevice:
        """Create a device, register it in memory, and persist.

        Returns the CoreDevice so the caller can handle lifecycle.
        """
        device = self._create_device(device_create)
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

    def rebuild_device(
        self,
        device: CoreDevice,
        driver: Driver,
        transport: TransportClient,
    ) -> CoreDevice:
        """Rebuild a device with new driver/transport.

        Preserves existing attribute values and tags.
        """
        new_device = CoreDevice.from_base(
            DeviceBase(id=device.id, name=device.name, config=device.config),
            driver=driver,
            transport=transport,
            restored_attributes=device.attributes,
            on_update=self._on_attribute_update,
        )
        new_device.tags = device.tags
        return new_device

    async def update(self, device_id: str, device_update: DeviceUpdate) -> CoreDevice:
        """Update a device in-place, rebuild if needed, and persist.

        Returns the (potentially rebuilt) Device so the caller can
        handle lifecycle side-effects (polling restart, listener init).
        """
        device = self._get_or_raise(device_id)
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
            device = self.rebuild_device(device, effective_driver, effective_transport)
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
        await self._storage.set_tag(device_id, key, value)
        return device

    async def delete_tag(self, device_id: str, key: str) -> CoreDevice:
        device = self._get_or_raise(device_id)
        device.tags.pop(key, None)
        await self._storage.delete_tag(device_id, key)
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
        return await device.write_attribute_value(
            attribute_name, value, confirm=confirm
        )

    async def restart_devices(
        self,
        *,
        driver_id: str | None = None,
        transport_id: str | None = None,
    ) -> None:
        """Stop then start all devices matching the given filters."""
        filters = DeviceFilters(driver_id=driver_id, transport_id=transport_id)
        for device in list(self._devices.values()):
            if filters.matches(device):
                await device.stop_sync()
                await device.start_sync()

    def _devices_for_driver(self, driver_id: str) -> list[CoreDevice]:
        return [d for d in self._devices.values() if d.driver_id == driver_id]

    def rebuild_attribute_in_devices(
        self, attribute_driver: AttributeDriver, *, driver_id: str
    ) -> None:
        """Rebuild the runtime attribute for all devices using driver_id."""
        for device in self._devices_for_driver(driver_id):
            device.rebuild_attribute(attribute_driver)

    def delete_attribute_in_devices(
        self, attribute_name: str, *, driver_id: str
    ) -> None:
        """Delete the runtime attribute for all devices using driver_id."""
        for device in self._devices_for_driver(driver_id):
            device.delete_attribute(attribute_name)

    def rename_attribute_in_devices(
        self,
        old_name: str,
        new_name: str,
        *,
        driver_id: str,
    ) -> None:
        """Rename the runtime attribute for all devices using driver_id."""
        for device in self._devices_for_driver(driver_id):
            device.rename_attribute(old_name, new_name)

    def update_type_in_devices(self, new_type: str | None, *, driver_id: str) -> None:
        """Update the runtime type for all devices using driver_id."""
        for device in list(self._devices.values()):
            if device.driver_id == driver_id:
                device.type = new_type

    def get_attribute_logs(self, device_id: str, attribute_name: str) -> AttributeLogs:
        device = self._get_or_raise(device_id)
        return device.get_attribute(attribute_name).logs
