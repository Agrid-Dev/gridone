from typing import Final

from devices_manager.core.standard_schemas import (
    StandardAttributeSchema,
    StandardAttributeSchemaField,
)
from devices_manager.types import DataType

ELECTRICITY_METER_KEY: Final = "electricity_meter"

electricity_meter_fields = [
    StandardAttributeSchemaField(
        name="energy", data_type=DataType.FLOAT, required=True
    ),
    StandardAttributeSchemaField(
        name="active_power", data_type=DataType.FLOAT, required=False
    ),
    StandardAttributeSchemaField(
        name="reactive_power", data_type=DataType.FLOAT, required=False
    ),
    StandardAttributeSchemaField(
        name="index", data_type=DataType.FLOAT, required=False
    ),
]

electricity_meter_schema = StandardAttributeSchema(
    key=ELECTRICITY_METER_KEY,
    name="electricity_meter",
    fields=electricity_meter_fields,
)
