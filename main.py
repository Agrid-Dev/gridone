from pathlib import Path

from core.device import Device
from load_driver import load_driver

om_driver = load_driver(Path(".db/drivers/open_meteo.yaml"))
om_device = Device.from_driver(
    om_driver,
    config={
        "lattitude": "48.866667",
        "longitude": "2.333",  # Paris
    },
)


async def main():
    print(f"Readding temperature for device {om_device.id}...")
    temperature = await om_device.read_attribute_value("temperature")
    print(f"Current temperature: {temperature} °C")


if __name__ == "__main__":
    import asyncio

    asyncio.run(main())
