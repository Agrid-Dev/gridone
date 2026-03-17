from typing import Final

from devices_manager.core.standard_schemas import (
    StandardAttributeSchema,
    StandardAttributeSchemaField,
)
from devices_manager.types import DataType

THERMOSTAT_KEY: Final = "thermostat"

thermostat_fields = [
    StandardAttributeSchemaField(
        name="temperature", data_type=DataType.FLOAT, required=True
    ),
    StandardAttributeSchemaField(
        name="temperature_setpoint", data_type=DataType.FLOAT, required=True
    ),
    StandardAttributeSchemaField(
        name="onoff_state", data_type=DataType.BOOL, required=True
    ),
    StandardAttributeSchemaField(name="mode", data_type=DataType.STRING, required=True),
    StandardAttributeSchemaField(
        name="fan_speed", data_type=DataType.STRING, required=False
    ),
    StandardAttributeSchemaField(
        name="temperature_setpoint_min", data_type=DataType.FLOAT, required=True
    ),
    StandardAttributeSchemaField(
        name="temperature_setpoint_max", data_type=DataType.FLOAT, required=True
    ),
]

thermostat_schema = StandardAttributeSchema(
    key=THERMOSTAT_KEY,
    name="Thermostat",
    fields=thermostat_fields,
)
