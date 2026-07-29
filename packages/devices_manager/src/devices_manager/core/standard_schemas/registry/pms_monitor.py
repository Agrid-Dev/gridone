from typing import Final

from devices_manager.core.standard_schemas import (
    StandardAttributeSchema,
    StandardAttributeSchemaField,
)
from devices_manager.types import DataType

PMS_MONITOR_KEY: Final = "pms_monitor"

pms_monitor_fields = [
    StandardAttributeSchemaField(
        name="occupied", data_type=DataType.BOOL, required=True
    ),
    StandardAttributeSchemaField(
        name="reservation_status", data_type=DataType.STRING, required=True
    ),
    StandardAttributeSchemaField(
        name="guest_count", data_type=DataType.INT, required=True
    ),
    # ISO-8601 datetime, empty string when no arrival is scheduled.
    StandardAttributeSchemaField(
        name="next_arrival_at", data_type=DataType.STRING, required=True
    ),
]

pms_monitor_schema = StandardAttributeSchema(
    key=PMS_MONITOR_KEY,
    name="PMS Monitor",
    fields=pms_monitor_fields,
)
