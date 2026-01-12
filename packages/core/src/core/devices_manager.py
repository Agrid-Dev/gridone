import asyncio
import logging
from typing import TypedDict

from .device import AttributeListener, Device
from .driver import Driver
from .transports import TransportClient, TransportMetadata, make_transport_client
from .transports.factory import make_transport_config
from .types import DeviceConfig, TransportProtocols

logger = logging.getLogger(__name__)


class DeviceRaw(TypedDict):
    id: str
    driver: str
    transport_id: str
    config: DeviceConfig


class DriverRaw(TypedDict):
    name: str
    transport: str
    device_config: list[dict]
    attributes: list[dict]


class TransportRaw(TypedDict):
    id: str
    protocol: str
    config: dict


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
            if device.driver.schema.update_strategy.polling_enabled:
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
        poll_interval = device.driver.schema.update_strategy.polling_interval
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
        drivers_raw: list[DriverRaw],
        transports: list[TransportRaw],
    ) -> "DevicesManager":
        """Must be called within an async context because of some client
        instanciations (to be improved)."""
        transports: dict[str, TransportClient] = {
            t["id"]: make_transport_client(
                TransportProtocols(t["protocol"]),
                make_transport_config(TransportProtocols(t["protocol"]), t["config"]),
                TransportMetadata(id=t["id"], name=t["id"]),
            )
            for t in transports
        }
        drivers_raw_dict: dict[str, DriverRaw] = {d["name"]: d for d in drivers_raw}
        dm = cls({}, {}, transports)

        for d in devices_raw:
            transport_client = dm.transports[d["transport_id"]]
            driver_raw = drivers_raw_dict[d["driver"]]
            driver = Driver.from_dict(driver_raw)  # ty:ignore[invalid-argument-type]
            dm.drivers[driver.name] = driver
            device = Device.from_driver(
                driver, transport_client, d["config"], device_id=d["id"]
            )
            dm._attach_listeners(device)
            dm.devices[d["id"]] = device

        return dm

    @staticmethod
    def build_driver(driver_raw: DriverRaw) -> Driver:
        return Driver.from_dict(driver_raw)  # ty:ignore[invalid-argument-type]

    @staticmethod
    def build_device(
        device_raw: DeviceRaw, driver_raw: DriverRaw, transport: TransportRaw
    ) -> Device:
        driver = DevicesManager.build_driver(driver_raw)
        protocol = TransportProtocols(transport["protocol"])
        transport_client = make_transport_client(
            protocol,
            make_transport_config(protocol, transport["config"]),
            TransportMetadata(id=transport["id"], name=transport["id"]),
        )
        return Device.from_driver(
            driver, transport_client, device_raw["config"], device_id=device_raw["id"]
        )

    def add_device(self, device: Device) -> None:
        if device.id in self.devices:
            msg = f"Device with id {device.id} already exists"
            raise ValueError(msg)
        self.devices[device.id] = device
        if self._running and device.driver.schema.update_strategy.polling_enabled:
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
