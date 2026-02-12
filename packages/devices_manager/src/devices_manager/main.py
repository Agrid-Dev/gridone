import asyncio
import logging
import uuid
from pathlib import Path
from typing import TypeVar

from .core.device import AttributeListener, Device, DeviceBase
from .core.discovery_manager import (
    DevicesDiscoveryManager,
    DiscoveryContext,
)
from .core.driver import Driver
from .core.tasks_registry import TasksRegistry
from .core.transports import (
    TransportClient,
    TransportMetadata,
    make_transport_client,
    make_transport_config,
)
from .dto import (
    DeviceCreateDTO,
    DeviceDTO,
    DeviceUpdateDTO,
    DriverDTO,
    TransportCreateDTO,
    TransportDTO,
    TransportUpdateDTO,
    device_core_to_dto,
    device_dto_to_base,
    driver_core_to_dto,
    driver_dto_to_core,
    transport_core_to_dto,
)
from .errors import ForbiddenError, InvalidError, NotFoundError
from .storage.core_file_storage import CoreFileStorage
from .types import AttributeValueType

logger = logging.getLogger(__name__)


def gen_id() -> str:
    """Generate an id for a new device"""
    return str(uuid.uuid4())[:8]


class DevicesManager:
    _devices: dict[str, Device]
    _drivers: dict[str, Driver]
    _transports: dict[str, TransportClient]
    _polling_tasks: TasksRegistry
    _discovery_manager: DevicesDiscoveryManager
    _running: bool
    _attribute_listeners: list[AttributeListener]

    def __init__(
        self,
        devices: dict[str, Device],
        drivers: dict[str, Driver],
        transports: dict[str, TransportClient],
        *,
        attribute_update_listeners: list[AttributeListener] | None = None,
    ) -> None:
        self._devices = devices
        self._drivers = drivers
        self._transports = transports
        self._polling_tasks = TasksRegistry()
        self._running = False
        self._attribute_listeners = attribute_update_listeners or []
        if self._attribute_listeners:
            for device in self._devices.values():
                self._attach_listeners(device)

    async def start_polling(self) -> None:
        for device in self._devices.values():
            await device.init_listeners()
            if device.driver.update_strategy.polling_enabled:
                logger.info("Starting polling job for device %s", device.id)
                self._polling_tasks.add(
                    ("poll", device.id), self._device_poll_loop(device)
                )
        self._running = True

    async def stop_polling(self) -> None:
        self._running = False
        await self._polling_tasks.shutdown()

    async def _device_poll_loop(self, device: Device) -> None:
        poll_interval = device.driver.update_strategy.polling_interval
        try:
            while self._running:
                await device.update_attributes()
                await asyncio.sleep(poll_interval)
        except asyncio.CancelledError:
            return

    _T = TypeVar("_T")

    @staticmethod
    def _get_or_raise(
        registry: dict[str, _T],
        entity_id: str,
        label: str,
    ) -> _T:
        try:
            return registry[entity_id]
        except KeyError as e:
            msg = f"{label} {entity_id} not found"
            raise NotFoundError(msg) from e

    def _validate_device_config(self, device_config: dict, driver: Driver) -> None:
        for field in driver.device_config_required:
            if field.required and field.name not in device_config:
                msg = f"Device config misses driver required field '{field.name}'"
                raise InvalidError(msg)

    def _create_device(self, device_create: DeviceCreateDTO) -> Device:
        driver = self._get_or_raise(self._drivers, device_create.driver_id, "Driver")
        self._validate_device_config(device_create.config, driver)
        transport = self._get_or_raise(
            self._transports, device_create.transport_id, "Transport"
        )
        self._check_driver_transport_compat(driver, transport)
        device_base = DeviceBase(
            id=gen_id(), name=device_create.name, config=device_create.config
        )
        return Device.from_base(device_base, driver=driver, transport=transport)

    def _add_device(self, device: Device) -> None:
        if device.id in self._devices:
            msg = f"Device with id {device.id} already exists"
            raise ValueError(msg)
        self._devices[device.id] = device
        if self._running and device.driver.update_strategy.polling_enabled:
            logger.info(
                "Starting polling job for newly discovered device %s", device.id
            )
            self._polling_tasks.add(("poll", device.id), self._device_poll_loop(device))

        logger.info("Successfully loaded and registered device '%s'", device.id)

    def add_device(self, device_create: DeviceCreateDTO) -> DeviceDTO:
        device = self._create_device(device_create)
        self._add_device(device)
        logger.info(
            "Successfully created and registered device '%s' (id: %s)",
            device_create.name,
            device.id,
        )
        return device_core_to_dto(device)

    def add_device_attribute_listener(
        self,
        callback: AttributeListener,
    ) -> None:
        """Attach a callback to every device for attribute updates."""
        self._attribute_listeners.append(callback)
        for device in self._devices.values():
            device.add_update_listener(callback)

    def _attach_listeners(self, device: Device) -> None:
        for listener in self._attribute_listeners:
            device.add_update_listener(listener)

    @property
    def poll_count(self) -> int:
        return len(self._polling_tasks)

    @property
    def discovery_manager(self) -> DevicesDiscoveryManager:
        if not hasattr(self, "_discovery_manager"):
            discovery_context = DiscoveryContext(
                get_driver=lambda driver_id: self._drivers[driver_id],
                get_transport=lambda transport_id: self._transports[transport_id],
                add_device=self._add_device,
                device_exists=lambda device: any(
                    d == device for d in self._devices.values()
                ),
            )
            self._discovery_manager = DevicesDiscoveryManager(context=discovery_context)
        return self._discovery_manager

    @classmethod
    def from_dto(
        cls,
        devices: list[DeviceDTO],
        drivers: list[DriverDTO],
        transports: list[TransportDTO],
    ) -> "DevicesManager":
        dm = cls(
            devices={},
            drivers={},
            transports={},
        )
        for t in transports:
            try:
                dm.add_transport(t)
            except Exception:
                logger.exception("Failed to init transport %s", t.id)
        for d in drivers:
            try:
                dm.add_driver(d)
            except Exception:
                logger.exception("Failed to init driver %s", d.id)
        for d in devices:
            try:
                driver = dm._drivers[d.driver_id]
            except KeyError:
                logger.exception(
                    "Cannot create device %s: missing driver %s", d.id, d.driver_id
                )
                continue
            try:
                transport = dm._transports[d.transport_id]
            except KeyError:
                logger.exception(
                    "Cannot create device %s: missing transport %s",
                    d.id,
                    d.transport_id,
                )
                continue
            logger.info("Adding device %s", d.id)
            try:
                base = device_dto_to_base(d)
                device = Device.from_base(base, transport=transport, driver=driver)
                dm._add_device(device)
            except Exception:
                logger.exception("Failed to init device %s", d.id)
        return dm

    @classmethod
    def from_storage(cls, db_path: str | Path) -> "DevicesManager":
        repository = CoreFileStorage(db_path)
        return cls.from_dto(
            devices=repository.devices.read_all(),
            drivers=repository.drivers.read_all(),
            transports=repository.transports.read_all(),
        )

    @property
    def transport_ids(self) -> set[str]:
        return set(self._transports.keys())

    def list_transports(self) -> list[TransportDTO]:
        return [transport_core_to_dto(t) for t in self._transports.values()]

    def get_transport(self, transport_id: str) -> TransportDTO:
        client = self._get_or_raise(self._transports, transport_id, "Transport")
        return transport_core_to_dto(client)

    def add_transport(
        self, transport: TransportCreateDTO | TransportDTO
    ) -> TransportDTO:
        config = make_transport_config(
            transport.protocol, transport.config.model_dump()
        )
        transport_id = str(transport.id) if hasattr(transport, "id") else gen_id()
        metadata = TransportMetadata(id=transport_id, name=transport.name)
        client = make_transport_client(transport.protocol, config, metadata)
        self._transports[metadata.id] = client
        return transport_core_to_dto(client)

    def _assert_transport_not_used(self, transport_id: str) -> None:
        device = next(
            (d for d in self._devices.values() if d.transport.id == transport_id), None
        )
        if device is not None:
            msg = f"Transport {transport_id} is used by device {device.id}"
            raise ForbiddenError(msg)

    async def delete_transport(self, transport_id: str) -> None:
        self._get_or_raise(self._transports, transport_id, "Transport")
        self._assert_transport_not_used(transport_id)
        transport = self._transports.pop(transport_id)
        await transport.close()

    async def update_transport(
        self, transport_id: str, update: TransportUpdateDTO
    ) -> TransportDTO:
        transport = self._get_or_raise(self._transports, transport_id, "Transport")
        if update.name is not None:
            transport.metadata.name = update.name
        if update.config is not None:
            transport.update_config(update.config)
        return transport_core_to_dto(transport)

    @property
    def driver_ids(self) -> set[str]:
        return set(self._drivers.keys())

    def list_drivers(self) -> list[DriverDTO]:
        return [driver_core_to_dto(driver) for driver in self._drivers.values()]

    def get_driver(self, driver_id: str) -> DriverDTO:
        driver = self._get_or_raise(self._drivers, driver_id, "Driver")
        return driver_core_to_dto(driver)

    def add_driver(self, driver_dto: DriverDTO) -> DriverDTO:
        if driver_dto.id in self._drivers:
            msg = f"Driver {driver_dto.id} already exists"
            raise ValueError(msg)
        driver = driver_dto_to_core(driver_dto)
        self._drivers[driver_dto.id] = driver
        return driver_core_to_dto(driver)

    def _assert_driver_not_used(self, driver_id: str) -> None:
        device = next(
            (d for d in self._devices.values() if d.driver.id == driver_id), None
        )
        if device is not None:
            msg = f"Driver {driver_id} is used by device {device.id}"
            raise ForbiddenError(msg)

    def delete_driver(self, driver_id: str) -> None:
        self._get_or_raise(self._drivers, driver_id, "Driver")
        self._assert_driver_not_used(driver_id)
        del self._drivers[driver_id]

    @property
    def device_ids(self) -> set[str]:
        return set(self._devices.keys())

    def list_devices(self) -> list[DeviceDTO]:
        return [device_core_to_dto(device) for device in self._devices.values()]

    def get_device(self, device_id: str) -> DeviceDTO:
        device = self._get_or_raise(self._devices, device_id, "Device")
        return device_core_to_dto(device)

    def _resolve_driver(self, driver_id: str | None) -> Driver | None:
        if driver_id is None:
            return None
        return self._get_or_raise(self._drivers, driver_id, "Driver")

    def _resolve_transport(self, transport_id: str | None) -> TransportClient | None:
        if transport_id is None:
            return None
        return self._get_or_raise(self._transports, transport_id, "Transport")

    @staticmethod
    def _check_driver_transport_compat(
        driver: Driver, transport: TransportClient
    ) -> None:
        if driver.transport != transport.protocol:
            msg = f"Transport {transport.id} is not compatible with driver {driver.id}"
            raise ValueError(msg)

    def _rebuild_device(
        self,
        device: Device,
        driver: Driver,
        transport: TransportClient,
    ) -> Device:
        initial_values = {
            name: attr.current_value
            for name, attr in device.attributes.items()
            if attr.current_value is not None
        }
        device_base = DeviceBase(id=device.id, name=device.name, config=device.config)
        return Device.from_base(
            device_base,
            driver=driver,
            transport=transport,
            initial_values=initial_values,
        )

    async def update_device(
        self, device_id: str, device_update: DeviceUpdateDTO
    ) -> DeviceDTO:
        device = self._get_or_raise(self._devices, device_id, "Device")
        new_driver = self._resolve_driver(device_update.driver_id)
        new_transport = self._resolve_transport(device_update.transport_id)
        effective_driver = new_driver or device.driver
        effective_transport = new_transport or device.transport

        self._check_driver_transport_compat(effective_driver, effective_transport)

        if device_update.name is not None:
            device.name = device_update.name
        if device_update.config is not None:
            device.config = device_update.config

        if new_driver is not None:
            self._validate_device_config(device.config, new_driver)
        elif device_update.config is not None:
            self._validate_device_config(device_update.config, device.driver)

        if new_driver is not None or new_transport is not None:
            self._devices[device_id] = self._rebuild_device(
                device, effective_driver, effective_transport
            )

        return device_core_to_dto(self._devices[device_id])

    async def write_device_attribute(
        self,
        device_id: str,
        attribute_name: str,
        value: AttributeValueType,
        *,
        confirm: bool = True,
    ) -> None:
        device = self._get_or_raise(self._devices, device_id, "Device")
        if attribute_name not in device.attributes:
            msg = f"Attribute '{attribute_name}' not found on device {device_id}"
            raise NotFoundError(msg)
        await device.write_attribute_value(attribute_name, value, confirm=confirm)

    async def delete_device(self, device_id: str) -> None:
        self._get_or_raise(self._devices, device_id, "Device")
        polling_key = ("poll", device_id)
        if self._polling_tasks.has(polling_key):
            await self._polling_tasks.remove(polling_key)
        del self._devices[device_id]

    async def read_device(self, device_id: str) -> DeviceDTO:
        device = self._get_or_raise(self._devices, device_id, "Device")
        if self._running:
            return device_core_to_dto(device)
        async with device.transport:
            # if not running open and close transport to read once
            await device.update_attributes()
            return device_core_to_dto(device)

    async def stop(self) -> None:
        await self.stop_polling()
        await asyncio.gather(*(t.close() for t in self._transports.values()))
