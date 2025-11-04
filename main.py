from core.device_schema import DeviceSchema
from core.device_schema.base import AttributeSchema, DeviceConfigField

# "om" stands for OpenMeteo

om_schema = DeviceSchema(
    name="open-meteo-current-weather",
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
            name="temperature",
            protocol_key="https://api.open-meteo.com/v1/forecast?latitude=${lattitude}&longitude=${longitude}&current_weather=true",
            value_parser=lambda result: result["current_weather"]["temperature"],
        ),
    ],
)
