import asyncio
import logging

from pydantic import BaseModel

from .device import AttributeListener, Device
from .driver import Driver
from .transports import TransportClient
from .types import DeviceConfig

logger = logging.getLogger(__name__)


class DeviceRaw(BaseModel):
    id: str
    driver: str
    transport_id: str
    config: DeviceConfig


POLL_INTERVAL = 10


class DevicesManager:
    devices: dict[str, Device]
    drivers: dict[str, Driver]
    transports: dict[str, TransportClient]
    _background_tasks: set[asyncio.Task]
    _running: bool
    _attribute_listeners: list[AttributeListener]

    def __init__(
        self,
        devices: dict[str, Device],
        drivers: dict[str, Driver],
        transports: dict[str, TransportClient],
    ) -> None:
        self.devices = devices
        self.drivers = drivers
        self.transports = transports
        self._background_tasks = set()
        self._running = False
        self._attribute_listeners = []

    async def start_polling(self) -> None:
        for device in self.devices.values():
            if device.driver.update_strategy.polling_enabled:
                logger.info("Starting polling job for device %s", device.id)
                task = asyncio.create_task(self._device_poll_loop(device))
                self._background_tasks.add(task)
                task.add_done_callback(self._background_tasks.discard)
                self._running = True

    async def stop_polling(self) -> None:
        self._running = False
        tasks = list(self._background_tasks)
        for task in tasks:
            logger.debug("Stopping task %s", task)
            task.cancel()
        if tasks:
            await asyncio.gather(*tasks, return_exceptions=True)
        self._background_tasks.clear()

    async def _device_poll_loop(self, device: Device) -> None:
        poll_interval = device.driver.update_strategy.polling_interval
        try:
            while self._running:
                await device.update_attributes()
                await asyncio.sleep(poll_interval)
        except asyncio.CancelledError:
            return

    @classmethod
    def load_from_raw(
        cls,
        devices_raw: list[DeviceRaw],
        drivers: list[Driver],
        transports: list[TransportClient],
    ) -> "DevicesManager":
        """Must be called within an async context because of some client
        instanciations (to be improved)."""
        transports: dict[str, TransportClient] = {t.metadata.id: t for t in transports}
        drivers: dict[str, Driver] = {d.metadata.id: d for d in drivers}
        dm = cls({}, drivers, transports)

        for d in devices_raw:
            try:
                transport_client = dm.transports[d.transport_id]
            except KeyError:
                msg = f"Missing transport {d.transport_id} for device {d.id}"
                logger.exception(msg)
            try:
                driver = dm.drivers[d.driver]
            except KeyError:
                msg = f"Missing driver {d.driver} for device {d.id}"
                logger.exception(msg)
            device = Device.from_driver(
                driver, transport_client, d.config, device_id=d.id
            )
            dm._attach_listeners(device)
            dm.devices[d.id] = device

        return dm

    @staticmethod
    def build_device(
        device_raw: DeviceRaw | dict, driver: Driver, transport: TransportClient
    ) -> Device:
        if isinstance(device_raw, dict):
            device_raw = DeviceRaw(**device_raw)
        return Device.from_driver(
            driver, transport, device_raw.config, device_id=device_raw.id
        )

    def add_device(self, device: Device) -> None:
        if device.id in self.devices:
            msg = f"Device with id {device.id} already exists"
            raise ValueError(msg)
        self.devices[device.id] = device
        if self._running and device.driver.update_strategy.polling_enabled:
            logger.info(
                "Starting polling job for newly discovered device %s", device.id
            )
            task = asyncio.create_task(self._device_poll_loop(device))
            self._background_tasks.add(task)
            task.add_done_callback(self._background_tasks.discard)

        logger.info("Successfully loaded and registered device '%s'", device.id)

    def add_device_attribute_listener(
        self,
        callback: AttributeListener,
    ) -> None:
        """Attach a callback to every device for attribute updates."""
        self._attribute_listeners.append(callback)
        for device in self.devices.values():
            device.add_update_listener(callback)

    def _attach_listeners(self, device: Device) -> None:
        for listener in self._attribute_listeners:
            device.add_update_listener(listener)
