import asyncio
from pathlib import Path
from typing import TypedDict

from core.device import Device
from core.types import AttributeValueType
from repository import gridone_repository  # ty: ignore[unresolved-import]


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


async def read_device(device: Device) -> None:
    async with device.driver.transport:
        for attribute in device.attributes:
            value = await device.read_attribute_value(attribute)
            print(f"{attribute}: {value}")


ALL_DRIVERS = [d["driver"] for d in DEVICES_DATA]


async def write_device(
    device: Device, attribute_writes: dict[str, AttributeValueType]
) -> None:
    async with device.driver.transport:
        for attribute_name, value in attribute_writes.items():
            print(f"{device.id}: {attribute_name} <- {value}")
            await device.write_attribute_value(attribute_name, value)
            print("write seems to have succeeded, confirming...")
            await asyncio.sleep(0.25)  # wait propagation
            new_value = await device.read_attribute_value(attribute_name)
            if new_value == value:
                print("✅ Success")
            else:
                print(f"❌ Failed: {new_value} != {value}")


async def watch_device(device: Device) -> None:
    print(f"Watching device {device.id} - {device.driver.name}")
    async with device.driver.transport:
        print("Initializing current values...")
        for attribute in device.attributes:
            await device.read_attribute_value(attribute)

        def stringify_device() -> str:
            attributes_str = [
                f"{attribute.name}:{attribute.current_value}"
                for attribute in device.attributes.values()
            ]
            return " - ".join(attributes_str)

        current = stringify_device()
        print(current)
        while True:
            new = stringify_device()
            if new != current:
                print(new)
                current = new
            await asyncio.sleep(0.2)


async def main() -> None:
    await gridone_repository.init_device_manager()
    print("Devices manager initiated")


if __name__ == "__main__":
    asyncio.run(main())
