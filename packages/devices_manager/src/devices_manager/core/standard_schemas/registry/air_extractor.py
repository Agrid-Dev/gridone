from typing import Final

from devices_manager.core.standard_schemas import (
    StandardAttributeSchema,
    StandardAttributeSchemaField,
)
from devices_manager.types import DataType

AIR_EXTRACTOR_KEY: Final = "air_extractor"

air_extractor_fields = [
    StandardAttributeSchemaField(
        name="onoff_state", data_type=DataType.BOOL, required=False
    ),
    StandardAttributeSchemaField(
        name="fan_speed", data_type=DataType.FLOAT, required=False
    ),
    StandardAttributeSchemaField(
        name="flow_switch", data_type=DataType.BOOL, required=False
    ),
]

air_extractor_schema = StandardAttributeSchema(
    key=AIR_EXTRACTOR_KEY,
    name="Air Extractor",
    fields=air_extractor_fields,
)
