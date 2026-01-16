import asyncio
import logging

from .device import AttributeListener, Device
from .driver import Driver
from .transports import TransportClient

logger = logging.getLogger(__name__)


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
        *,
        attribute_update_listeners: list[AttributeListener] | None = None,
    ) -> None:
        self.devices = devices
        self.drivers = drivers
        self.transports = transports
        self._background_tasks = set()
        self._running = False
        self._attribute_listeners = attribute_update_listeners or []
        if self._attribute_listeners:
            for device in self.devices.values():
                self._attach_listeners(device)

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
            self._attach_listeners(device)

    def _attach_listeners(self, device: Device) -> None:
        for listener in self._attribute_listeners:
            device.add_update_listener(listener)
