from pathlib import Path

import yaml

from core.device import Device
from core.driver import Driver


def load_driver(path: Path) -> Driver:
    with path.open("r") as f:
        schema_data = yaml.safe_load(f)
        return Driver.from_dict(schema_data)


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
    weather_code = await om_device.read_attribute_value("weather_code")
    print(f"Current weather code: {weather_code}")


if __name__ == "__main__":
    import asyncio

    asyncio.run(main())
