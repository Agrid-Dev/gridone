import asyncio
import logging

from devices_manager.core.device import AttributeListener, Device
from devices_manager.core.driver import Driver
from devices_manager.core.transports import TransportClient

from .devices_discovery_manager import (
    DevicesDiscoveryManager,
    DiscoveryContext,
)
from .tasks_registry import TasksRegistry

logger = logging.getLogger(__name__)


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
