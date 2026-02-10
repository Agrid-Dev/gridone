import asyncio
import logging
import uuid
from pathlib import Path

from .core.device import AttributeListener, Device
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
    DeviceDTO,
    DriverDTO,
    TransportCreateDTO,
    TransportDTO,
    TransportUpdateDTO,
    device_dto_to_base,
    driver_core_to_dto,
    driver_dto_to_core,
    transport_core_to_dto,
    transport_dto_to_core,
)
from .errors import ForbiddenError, NotFoundError
from .storage.core_file_storage import CoreFileStorage

logger = logging.getLogger(__name__)


def gen_id() -> str:
    """Generate an id for a new device"""
    return str(uuid.uuid4())[:8]


class DevicesManager:
    devices: dict[str, Device]
    drivers: dict[str, Driver]
    transports: dict[str, TransportClient]
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
        self.devices = devices
        self.drivers = drivers
        self.transports = transports
        self._polling_tasks = TasksRegistry()
        self._running = False
        self._attribute_listeners = attribute_update_listeners or []
        if self._attribute_listeners:
            for device in self.devices.values():
                self._attach_listeners(device)

    async def start_polling(self) -> None:
        for device in self.devices.values():
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

    def add_device(self, device: Device) -> None:
        if device.id in self.devices:
            msg = f"Device with id {device.id} already exists"
            raise ValueError(msg)
        self.devices[device.id] = device
        if self._running and device.driver.update_strategy.polling_enabled:
            logger.info(
                "Starting polling job for newly discovered device %s", device.id
            )
            self._polling_tasks.add(("poll", device.id), self._device_poll_loop(device))

        logger.info("Successfully loaded and registered device '%s'", device.id)

    def add_device_attribute_listener(
        self,
        callback: AttributeListener,
    ) -> None:
        """Attach a callback to every device for attribute updates."""
        self._attribute_listeners.append(callback)
        for device in self.devices.values():
            device.add_update_listener(callback)
            self._attach_listeners(device)

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
                get_driver=lambda driver_id: self.drivers[driver_id],
                get_transport=lambda transport_id: self.transports[transport_id],
                add_device=self.add_device,
                device_exists=lambda device: any(
                    d == device for d in self.devices.values()
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
                dm.transports[t.id] = transport_dto_to_core(t)
            except Exception:
                logger.exception("Failed to init transport %s", t.id)
        for d in drivers:
            try:
                dm.drivers[d.id] = driver_dto_to_core(d)
            except Exception:
                logger.exception("Failed to init driver %s", d.id)
        for d in devices:
            try:
                driver = dm.drivers[d.driver_id]
            except KeyError:
                logger.exception(
                    "Cannot create device %s: missing driver %", d.id, d.driver_id
                )
                continue
            try:
                transport = dm.transports[d.transport_id]
            except KeyError:
                logger.exception(
                    "Cannot create device %s: missing transport %", d.id, d.transport_id
                )
                continue
            logger.info("Adding device %s", d.id)
            try:
                base = device_dto_to_base(d)
                device = Device.from_base(base, transport=transport, driver=driver)
                dm.add_device(device)
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

    def list_drivers(self) -> list[DriverDTO]:
        return [driver_core_to_dto(driver) for driver in self.drivers.values()]

    def list_transports(self) -> list[TransportDTO]:
        return [transport_core_to_dto(t) for t in self.transports.values()]

    def get_transport(self, transport_id: str) -> TransportClient:
        try:
            return transport_core_to_dto(self.transports[transport_id])
        except KeyError as e:
            msg = f"Transport {transport_id} not found"
            raise NotFoundError(msg) from e

    def add_transport(self, transport: TransportCreateDTO) -> TransportDTO:
        config = make_transport_config(
            transport.protocol, transport.config.model_dump()
        )
        metadata = TransportMetadata(id=gen_id(), name=transport.name)
        client = make_transport_client(transport.protocol, config, metadata)
        self.transports[metadata.id] = client
        return transport_core_to_dto(client)

    def _assert_transport_not_used(self, transport_id: str) -> None:
        device = next(
            (d for d in self.devices.values() if d.transport.id == transport_id), None
        )
        if device is not None:
            msg = f"Transport {transport_id} is still used by device {device.id}"
            raise ForbiddenError(msg)

    async def delete_transport(self, transport_id: str) -> None:
        self._assert_transport_not_used(transport_id)
        try:
            transport = self.transports.pop(transport_id)
            await transport.close()
        except KeyError as e:
            msg = f"Transport {transport_id} not found"
            raise NotFoundError(msg) from e

    async def update_transport(
        self, transport_id: str, update: TransportUpdateDTO
    ) -> TransportDTO:
        transport = self.transports.get(transport_id)
        if transport is None:
            msg = f"Transport {transport_id} not found"
            raise NotFoundError(msg)
        if update.name is not None:
            transport.metadata.name = update.name
        if update.config is not None:
            transport.update_config(update.config)
        return transport_core_to_dto(transport)

    def get_driver(self, driver_id: str) -> DriverDTO:
        try:
            return driver_core_to_dto(self.drivers[driver_id])
        except KeyError as e:
            msg = f"Driver {driver_id} not found"
            raise NotFoundError(msg) from e

    def add_driver(self, driver_dto: DriverDTO) -> DriverDTO:
        if driver_dto.id in self.drivers:
            msg = f"Driver {driver_dto.id} already exists"
            raise ValueError(msg)
        driver = driver_dto_to_core(driver_dto)
        self.drivers[driver_dto.id] = driver
        return driver_core_to_dto(driver)

