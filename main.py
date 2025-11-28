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
]


def get_device(driver_name: str) -> Device:
    try:
        device_data = next(d for d in DEVICES_DATA if d["driver"] == driver_name)
    except StopIteration as e:
        msg = f"Device {driver_name} not found"
        raise ValueError(msg) from e
    return load_device(
        DRIVERS_DB / (device_data["driver"] + ".yaml"),
        device_data["device_config"],
        device_data["transport_config"],
    )


async def read_device(driver_name: str) -> None:
    device = get_device(driver_name)
    async with device.driver.transport:
        for attribute in device.attributes:
            value = await device.read_attribute_value(attribute)
            print(f"{attribute}: {value}")


ALL_DRIVERS = [d["driver"] for d in DEVICES_DATA]


async def read_all() -> None:
    drivers_count = len(ALL_DRIVERS)
    print(f"{drivers_count} devices to read")
    for i, driver in enumerate(ALL_DRIVERS):
        print(f"💡 Device {i + 1}/{drivers_count} ({driver})")
        await read_device(driver)


async def write_device(
    driver_name: str, attribute_writes: dict[str, AttributeValueType]
) -> None:
    device = get_device(driver_name)
    async with device.driver.transport:
        for attribute_name, value in attribute_writes.items():
            print(f"{driver_name}: {attribute_name} <- {value}")
            await device.write_attribute_value(attribute_name, value)
            print("write seems to have succeeded, confirming...")
            await asyncio.sleep(0.25)  # wait propagation
            new_value = await device.read_attribute_value(attribute_name)
            if new_value == value:
                print("✅ Success")
            else:
                print(f"❌ Failed: {new_value} != {value}")


if __name__ == "__main__":
    writes = {"state": False, "temperature_setpoint": 20}
    for driver in ALL_DRIVERS:
        asyncio.run(write_device(driver, writes))
    asyncio.run(read_all())
