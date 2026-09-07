from typing import Final

from devices_manager.core.standard_schemas import (
    StandardAttributeSchema,
    StandardAttributeSchemaField,
)
from devices_manager.types import DataType

LIQUID_DETECTOR_KEY: Final = "liquid_detector"

liquid_detector_fields = [
    # Conductive liquid bridging the probe. Named for what the sensor can
    # actually tell — a probe cannot distinguish water from glycol, condensate
    # or coolant, and the drip tray it sits in often holds one of those.
    StandardAttributeSchemaField(
        name="liquid_detected", data_type=DataType.BOOL, required=True
    ),
]

liquid_detector_schema = StandardAttributeSchema(
    key=LIQUID_DETECTOR_KEY,
    name="Liquid Detector",
    fields=liquid_detector_fields,
)
