import asyncio
import logging
from typing import TypedDict

from .device import AttributeListener, Device
from .driver import Driver
from .transports import TransportClientRegistry
from .types import AttributeValueType, DeviceConfig, TransportProtocols

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
    _attribute_listeners: list[AttributeListener]

    def __init__(self, devices: dict[str, Device], drivers: dict[str, Driver]) -> None:
        self.devices = devices
        self.drivers = drivers
        self._background_tasks = set()
        self._running = False
        self.transport_registry = TransportClientRegistry()
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
            device = Device.from_driver(driver, d["config"], device_id=d["id"])
            dm._attach_listeners(device)
            dm.devices[d["id"]] = device

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

    def add_device(
        self,
        device_raw: DeviceRaw,
        drivers_raw: list[DriverRaw],
        transport_configs: list[TransportConfigRaw],
        initial_attributes: dict[str, AttributeValueType] | None = None,
    ) -> Device:
        """Add a new device to the manager dynamically.

        Args:
            device_raw: Raw device data from storage
            drivers_raw: List of all driver raw data (to find the device's driver)
            transport_configs: List of all transport configs
            initial_attributes: Optional dictionary of attribute values to initialize
                               the device with (e.g., from discovery message)

        Returns:
            The newly created Device instance
        """
        # Build transport config dict
        transport_config_dict: dict[str, TransportConfigRaw] = {
            t["name"]: t for t in transport_configs
        }
        drivers_raw_dict: dict[str, DriverRaw] = {d["name"]: d for d in drivers_raw}

        # Get transport config
        transport_config = (
            transport_config_dict[device_raw["transport_config"]]
            if device_raw.get("transport_config")
            else {}
        )

        # Get driver raw data
        driver_raw = drivers_raw_dict[device_raw["driver"]]

        # Get or create transport client
        transport_client = self.transport_registry.get_transport(
            TransportProtocols(driver_raw["transport"]),
            transport_config,  # ty: ignore[invalid-argument-type]
        )

        # Get or create driver (reuse if already exists)
        if device_raw["driver"] not in self.drivers:
            driver = Driver.from_dict(driver_raw, transport_client)  # ty: ignore[invalid-argument-type]
            self.drivers[driver.name] = driver
        else:
            driver = self.drivers[device_raw["driver"]]

        # Create device
        device = Device.from_driver(
            driver, device_raw["config"], device_id=device_raw["id"]
        )

        # Attach existing listeners first (so they receive initial value updates)
        self._attach_listeners(device)

        # Initialize attributes with discovered values if provided
        if initial_attributes:
            for attr_name, attr_value in initial_attributes.items():
                if attr_name in device.attributes:
                    try:
                        # Use _update_attribute to properly set value and trigger
                        # listeners. This ensures WebSocket broadcasts and other
                        # listeners are notified
                        device._update_attribute(  # noqa: SLF001
                            device.attributes[attr_name], attr_value
                        )
                        logger.debug(
                            "Initialized attribute '%s' with value '%s' for "
                            "device '%s'",
                            attr_name,
                            attr_value,
                            device.id,
                        )
                    except (ValueError, TypeError) as e:
                        logger.warning(
                            "Failed to initialize attribute '%s' for device '%s': %s",
                            attr_name,
                            device.id,
                            e,
                        )

        # Add to devices dict
        self.devices[device.id] = device

        # Start polling if enabled and polling is running
        if self._running and device.driver.schema.update_strategy.polling_enabled:
            logger.info(
                "Starting polling job for newly discovered device %s", device.id
            )
            task = asyncio.create_task(self._device_poll_loop(device))
            self._background_tasks.add(task)
            task.add_done_callback(self._background_tasks.discard)

        logger.info("Successfully loaded and registered device '%s'", device.id)
        return device

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
