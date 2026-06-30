from typing import Final

from devices_manager.core.standard_schemas import (
    StandardAttributeSchema,
    StandardAttributeSchemaField,
)
from devices_manager.types import DataType

AHU_SINGLE_FLUX_KEY: Final = "ahu_single_flux"

ahu_single_flux_fields = [
    StandardAttributeSchemaField(
        name="supply_air_temperature", data_type=DataType.FLOAT, required=True
    ),
    StandardAttributeSchemaField(
        name="supply_air_temperature_setpoint", data_type=DataType.FLOAT, required=True
    ),
    StandardAttributeSchemaField(
        name="supply_fan_speed", data_type=DataType.FLOAT, required=True
    ),
    StandardAttributeSchemaField(
        name="onoff_state", data_type=DataType.BOOL, required=False
    ),
    StandardAttributeSchemaField(
        name="hvac_mode", data_type=DataType.STRING, required=False
    ),
    StandardAttributeSchemaField(
        name="supply_air_pressure", data_type=DataType.FLOAT, required=False
    ),
    StandardAttributeSchemaField(
        name="supply_air_pressure_setpoint", data_type=DataType.FLOAT, required=False
    ),
    StandardAttributeSchemaField(
        name="outdoor_air_temperature", data_type=DataType.FLOAT, required=False
    ),
    StandardAttributeSchemaField(
        name="extract_air_temperature", data_type=DataType.FLOAT, required=False
    ),
    StandardAttributeSchemaField(
        name="extract_air_pressure", data_type=DataType.FLOAT, required=False
    ),
    StandardAttributeSchemaField(
        name="extract_fan_speed", data_type=DataType.FLOAT, required=False
    ),
    StandardAttributeSchemaField(
        name="heating_valve", data_type=DataType.FLOAT, required=False
    ),
    StandardAttributeSchemaField(
        name="cooling_valve", data_type=DataType.FLOAT, required=False
    ),
]

ahu_single_flux_schema = StandardAttributeSchema(
    key=AHU_SINGLE_FLUX_KEY,
    name="Single-Flux Air Handling Unit",
    fields=ahu_single_flux_fields,
)
