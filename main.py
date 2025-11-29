import asyncio
from pathlib import Path
from typing import TypedDict

import yaml

from core.device import Device
from core.driver import Driver
from core.types import AttributeValueType


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
    {
        "driver": "breeze_bc106_4d_thermostat",
        "transport_config": {"ip_with_mask": "10.125.0.1/24"},
        "device_config": {"device_instance": 856402},
    },
    {
        "driver": "vrv_gateway_mqtt",
        "transport_config": {"host": "127.0.0.1"},
        "device_config": {
            "read_id": "30523-042:27",
            "vendor": "mitsubishi",
            "model": "mcc",
            "vendor_id": "05ef9a97-e2bd-4858-b174-1de10e3ef775",
            "user": "h2712-fo1@accor.com",
            "password": "Ibisclim2025++",
        },
    },
]


async def read_all() -> None:
    devices = {
        d["driver"]: load_device(
            DRIVERS_DB / (d["driver"] + ".yaml"),
            d["device_config"],
            d["transport_config"],
        )
        for d in DEVICES_DATA
    }
    print(f"Loaded {len(devices)} devices: {', '.join(devices.keys())}")
    for i, device in enumerate(devices.values()):
        print(f"💡 Device {i + 1}/{len(devices)} ({device.driver.name})")

        async with device.driver.transport:
            for attribute in device.attributes:
                value = await device.read_attribute_value(attribute)
                print(f"{attribute}: {value}")


async def write_attribute(
    driver_name: str, target_attribute: str, value: AttributeValueType
) -> None:
    device_data = next(d for d in DEVICES_DATA if d["driver"] == driver_name)
    device = load_device(
        DRIVERS_DB / (device_data["driver"] + ".yaml"),
        device_data["device_config"],
        device_data["transport_config"],
    )
    print(f"Writing {value} -> {driver_name} / {target_attribute}")
    async with device.driver.transport:
        await device.write_attribute_value(target_attribute, value)
        print("write seems to have succeeded, confirming...")
        await asyncio.sleep(0.25)  # wait propagation
        new_value = await device.read_attribute_value(target_attribute)
        if new_value == value:
            print("✅ Success")
        else:
            print(f"❌ Failed: {new_value} != {value}")


WRITABLE = ["agrid_thermostat_http", "carel_thermostat"]
if __name__ == "__main__":
    asyncio.run(read_all())
    asyncio.run(write_attribute("agrid_thermostat_mqtt", "state", False))
    asyncio.run(write_attribute("agrid_thermostat_mqtt", "temperature_setpoint", 20))
    asyncio.run(write_attribute("carel_thermostat", "temperature_setpoint", 20))
    asyncio.run(write_attribute("carel_thermostat", "state", False))
