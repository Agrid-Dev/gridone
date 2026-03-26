from typing import Final

from devices_manager.core.standard_schemas import (
    StandardAttributeSchema,
    StandardAttributeSchemaField,
)
from devices_manager.types import DataType

WEATHER_SENSOR_KEY: Final = "weather_sensor"

weather_sensor_fields = [
    StandardAttributeSchemaField(
        name="temperature", data_type=DataType.FLOAT, required=True
    ),
    StandardAttributeSchemaField(
        name="weather_code", data_type=DataType.INT, required=True
    ),
    StandardAttributeSchemaField(
        name="wind_speed", data_type=DataType.FLOAT, required=True
    ),
    StandardAttributeSchemaField(
        name="wind_direction", data_type=DataType.INT, required=True
    ),
    StandardAttributeSchemaField(
        name="humidity", data_type=DataType.FLOAT, required=True
    ),
]

weather_sensor_schema = StandardAttributeSchema(
    key=WEATHER_SENSOR_KEY,
    name="Weather Sensor",
    fields=weather_sensor_fields,
)
