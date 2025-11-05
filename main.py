from core.device import Device
from core.device_schema import DeviceSchema
from core.device_schema.base import AttributeSchema, DeviceConfigField
from core.driver import Driver
from core.transports.http import HTTPTransportClient
from core.types import DataType, TransportProtocols

# "om" stands for OpenMeteo

om_schema = DeviceSchema(
    name="open-meteo-current-weather",
    transport=TransportProtocols.HTTP,
    device_config_fields=[
        DeviceConfigField(
            name="lattitude",
            required=True,
        ),
        DeviceConfigField(
            name="longitude",
            required=True,
        ),
    ],
    attribute_schemas=[
        AttributeSchema(
            attribute_name="temperature",
            data_type=DataType.FLOAT,
            protocol_key="https://api.open-meteo.com/v1/forecast?latitude=${lattitude}&longitude=${longitude}&current_weather=true",
            value_parser=lambda result: result["current_weather"]["temperature"],
        ),
    ],
)

http_client = HTTPTransportClient()

om_driver = Driver(
    transport=http_client,
    schema=om_schema,
)

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
