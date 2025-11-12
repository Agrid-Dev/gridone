from pathlib import Path

import yaml

from core.device import Device
from core.driver import Driver


def load_driver(path: Path, transport_config: dict) -> Driver:
    with path.open("r") as f:
        schema_data = yaml.safe_load(f)
        return Driver.from_dict({**schema_data, "transport_config": transport_config})


def load_device(
    driver_path: Path, device_config: dict, transport_config: dict
) -> Device:
    driver = load_driver(driver_path, transport_config)
    return Device.from_driver(driver=driver, config=device_config)


DRIVERS_DB = Path(".db/drivers")
DEVICES_DATA = [
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
]


async def main():
    devices = {
        d["driver"]: load_device(
            DRIVERS_DB / (d["driver"] + ".yaml"),
            d["device_config"],
            d["transport_config"],
        )
        for d in DEVICES_DATA
    }
    print(f"Loaded {len(devices)} devices: {', '.join(devices.keys())}")
    for device in devices.values():
        print(
            f"Readding temperature for device {device.id}",
            f"({device.driver.name} - {device.driver.transport.protocol})...",
        )
        temperature = await device.read_attribute_value("temperature")
        print(f"Current temperature: {temperature:.2f} °C")


if __name__ == "__main__":
    import asyncio

    asyncio.run(main())
