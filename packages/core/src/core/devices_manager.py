from typing import TypedDict

from .device import Device
from .driver import Driver
from .transports.factory import get_transport_client
from .types import DeviceConfig, TransportProtocols


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


class DevicesManager:
    devices: dict[str, Device]
    drivers: dict[str, Driver]

    def __init__(self, devices: dict[str, Device], drivers: dict[str, Driver]) -> None:
        self.devices = devices
        self.drivers = drivers

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
        devices = {}
        drivers = {}
        for d in devices_raw:
            transport_config = (
                transport_config_dict[d["transport_config"]]
                if d.get("transport_config")
                else {}
            )

            driver_raw = drivers_raw_dict[d["driver"]]
            transport_client = get_transport_client(
                TransportProtocols(driver_raw["transport"]),
                transport_config,  # ty: ignore[invalid-argument-type]
            )
            driver = Driver.from_dict(driver_raw, transport_client)  # ty: ignore[invalid-argument-type]
            drivers[driver.name] = driver
            devices[d["id"]] = Device.from_driver(driver, d["config"])

        return cls(devices, drivers)

    @staticmethod
    def build_device(
        device_raw: DeviceRaw,
        driver_raw: DriverRaw,
        transport_config: TransportConfigRaw | None,
    ) -> Device:
        transport_client = get_transport_client(
            TransportProtocols(driver_raw["transport"]),
            transport_config or {},  # ty: ignore[invalid-argument-type]
        )
        driver = Driver.from_dict(driver_raw, transport_client)  # ty: ignore[invalid-argument-type]
        return Device.from_driver(driver, device_raw["config"])
