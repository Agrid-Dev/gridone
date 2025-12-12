import asyncio
import logging
from typing import TypedDict

from .device import Device
from .driver import Driver
from .transports import TransportClientRegistry
from .types import DeviceConfig, TransportProtocols

logger = logging.getLogger(__name__)


class DeviceRaw(TypedDict):
    id: str
    driver: str
    transport_config: str
    config: DeviceConfig


class DriverRaw(TypedDict):
    name: str
    transport: str


class TransportConfigRaw(TypedDict):
    name: str


POLL_INTERVAL = 10


class DevicesManager:
    devices: dict[str, Device]
    drivers: dict[str, Driver]
    transport_registry: TransportClientRegistry
    _background_tasks: set[asyncio.Task]
    _running: bool

    def __init__(self, devices: dict[str, Device], drivers: dict[str, Driver]) -> None:
        self.devices = devices
        self.drivers = drivers
        self._background_tasks = set()
        self._running = False
        self.transport_registry = TransportClientRegistry()

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
        transport_configs: list[TransportConfigRaw],
    ) -> "DevicesManager":
        """Must be called within an async context because of some client
        instanciations (to be improved)."""
        transport_config_dict: dict[str, TransportConfigRaw] = {
            t["name"]: t for t in transport_configs
        }
        drivers_raw_dict: dict[str, DriverRaw] = {d["name"]: d for d in drivers_raw}
        dm = cls({}, {})

        for d in devices_raw:
            transport_config = (
                transport_config_dict[d["transport_config"]]
                if d.get("transport_config")
                else {}
            )

            driver_raw = drivers_raw_dict[d["driver"]]
            transport_client = dm.transport_registry.get_transport(
                TransportProtocols(driver_raw["transport"]),
                transport_config,  # ty: ignore[invalid-argument-type]
            )
            driver = Driver.from_dict(driver_raw, transport_client)  # ty: ignore[invalid-argument-type]
            dm.drivers[driver.name] = driver
            dm.devices[d["id"]] = Device.from_driver(
                driver, d["config"], device_id=d["id"]
            )

        return dm

    @staticmethod
    def build_device(
        device_raw: DeviceRaw,
        driver_raw: DriverRaw,
        transport_config: TransportConfigRaw | None,
    ) -> Device:
        transport_client = TransportClientRegistry().get_transport(
            TransportProtocols(driver_raw["transport"]), dict(transport_config or {})
        )
        driver = Driver.from_dict(dict(driver_raw), transport_client)
        return Device.from_driver(
            driver, device_raw["config"], device_id=device_raw["id"]
        )
