from pathlib import Path
from typing import TypedDict

import yaml

from core.device import Device
from core.driver import Driver


def load_driver(path: Path, transport_config: dict) -> Driver:
    with path.open("r") as f:
        schema_data = yaml.safe_load(f)
        return Driver.from_dict({**schema_data, "transport_config": transport_config})


def load_device(
    driver_path: Path,
    device_config: dict,
    transport_config: dict,
) -> Device:
    driver = load_driver(driver_path, transport_config)
    return Device.from_driver(driver=driver, config=device_config)


class DeviceData(TypedDict):
    driver: str
    transport_config: dict
    device_config: dict


DRIVERS_DB = Path(".db/drivers")
DEVICES_DATA: list[DeviceData] = [
    {
        "driver": "open_meteo",
        "transport_config": {},
        "device_config": {
            "lattitude": "48.866667",
            "longitude": "2.333",  # Paris
        },
    },
    {
        "driver": "carel_thermostat",
        "transport_config": {"host": "10.125.0.11", "port": 4196},
        "device_config": {"device_id": 11},
    },
    {
        "driver": "agrid_thermostat_http",
        "transport_config": {},
        "device_config": {"ip": "http://10.125.0.120"},
    },
    {
        "driver": "agrid_thermostat_mqtt",
        "transport_config": {"host": "10.125.0.1"},
        "device_config": {"mac": "F0F5BD273F98"},
    },
]


async def main() -> None:
    devices = {
        d["driver"]: load_device(
            DRIVERS_DB / (d["driver"] + ".yaml"),
            d["device_config"],
            d["transport_config"],
        )
        for d in DEVICES_DATA
    }
    print(f"Loaded {len(devices)} devices: {', '.join(devices.keys())}")
    for i, device_data in enumerate(DEVICES_DATA):
        print(f"💡 Device {i + 1}/{len(devices)} ({device_data['driver']})")
        device = load_device(
            DRIVERS_DB / (device_data["driver"] + ".yaml"),
            device_data["device_config"],
            device_data["transport_config"],
        )
        async with device.driver.transport:
            for attribute in device.attributes:
                value = await device.read_attribute_value(attribute)
                print(f"{attribute}: {value}")
            if device_data["driver"] == "agrid_thermostat_http":
                target_setpoint = 23
                await device.write_attribute_value(
                    "temperature_setpoint",
                    target_setpoint,
                )
                print(f"temperature_setpoint written to {target_setpoint}")


if __name__ == "__main__":
    import asyncio

    asyncio.run(main())
