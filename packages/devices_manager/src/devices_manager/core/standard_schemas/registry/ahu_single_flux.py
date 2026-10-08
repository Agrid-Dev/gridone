from typing import Final

from devices_manager.core.standard_schemas import (
    StandardAttributeSchema,
    StandardAttributeSchemaField,
)
from devices_manager.types import DataType

AHU_SINGLE_FLUX_KEY: Final = "ahu_single_flux"

# Same vocabulary as `ahu_double_flux` (see the rationale there), minus the
# energy recovery and the extract-side filter and sensors a single-flux unit
# does not have. The extract train stays optional: some units carry a return
# fan without recovering anything from it.
ahu_single_flux_fields = [
    # --- Required core ------------------------------------------------------
    StandardAttributeSchemaField(
        name="supply_air_temperature", data_type=DataType.FLOAT, required=True
    ),
    StandardAttributeSchemaField(
        name="supply_air_temperature_setpoint", data_type=DataType.FLOAT, required=True
    ),
    StandardAttributeSchemaField(
        name="supply_fan_speed", data_type=DataType.FLOAT, required=True
    ),
    # --- Unit state ---------------------------------------------------------
    StandardAttributeSchemaField(
        name="onoff_state", data_type=DataType.BOOL, required=False
    ),
    StandardAttributeSchemaField(
        name="hvac_mode", data_type=DataType.STRING, required=False
    ),
    StandardAttributeSchemaField(
        name="supply_air_temperature_cooling_setpoint",
        data_type=DataType.FLOAT,
        required=False,
    ),
    # --- Air streams --------------------------------------------------------
    StandardAttributeSchemaField(
        name="outdoor_air_temperature", data_type=DataType.FLOAT, required=False
    ),
    StandardAttributeSchemaField(
        name="supply_air_pressure", data_type=DataType.FLOAT, required=False
    ),
    StandardAttributeSchemaField(
        name="supply_air_pressure_setpoint", data_type=DataType.FLOAT, required=False
    ),
    StandardAttributeSchemaField(
        name="supply_air_flow", data_type=DataType.FLOAT, required=False
    ),
    StandardAttributeSchemaField(
        name="supply_air_flow_setpoint", data_type=DataType.FLOAT, required=False
    ),
    StandardAttributeSchemaField(
        name="supply_air_humidity", data_type=DataType.FLOAT, required=False
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
    # --- Fans ---------------------------------------------------------------
    StandardAttributeSchemaField(
        name="supply_flow_switch", data_type=DataType.BOOL, required=False
    ),
    StandardAttributeSchemaField(
        name="extract_flow_switch", data_type=DataType.BOOL, required=False
    ),
    # --- Dampers ------------------------------------------------------------
    StandardAttributeSchemaField(
        name="outdoor_air_damper_open", data_type=DataType.BOOL, required=False
    ),
    StandardAttributeSchemaField(
        name="supply_air_damper_open", data_type=DataType.BOOL, required=False
    ),
    # --- Filters ------------------------------------------------------------
    StandardAttributeSchemaField(
        name="supply_prefilter_clogged", data_type=DataType.BOOL, required=False
    ),
    StandardAttributeSchemaField(
        name="supply_filter_clogged", data_type=DataType.BOOL, required=False
    ),
    StandardAttributeSchemaField(
        name="supply_filter_differential_pressure",
        data_type=DataType.FLOAT,
        required=False,
    ),
    # --- Heating coil loop --------------------------------------------------
    StandardAttributeSchemaField(
        name="heating_valve", data_type=DataType.FLOAT, required=False
    ),
    StandardAttributeSchemaField(
        name="heating_water_flow", data_type=DataType.FLOAT, required=False
    ),
    StandardAttributeSchemaField(
        name="heating_water_supply_temperature",
        data_type=DataType.FLOAT,
        required=False,
    ),
    StandardAttributeSchemaField(
        name="heating_water_return_temperature",
        data_type=DataType.FLOAT,
        required=False,
    ),
    StandardAttributeSchemaField(
        name="heating_power", data_type=DataType.FLOAT, required=False
    ),
    StandardAttributeSchemaField(
        name="heating_energy", data_type=DataType.FLOAT, required=False
    ),
    # --- Cooling coil loop --------------------------------------------------
    StandardAttributeSchemaField(
        name="cooling_valve", data_type=DataType.FLOAT, required=False
    ),
    StandardAttributeSchemaField(
        name="cooling_water_flow", data_type=DataType.FLOAT, required=False
    ),
    StandardAttributeSchemaField(
        name="cooling_water_supply_temperature",
        data_type=DataType.FLOAT,
        required=False,
    ),
    StandardAttributeSchemaField(
        name="cooling_water_return_temperature",
        data_type=DataType.FLOAT,
        required=False,
    ),
    StandardAttributeSchemaField(
        name="cooling_power", data_type=DataType.FLOAT, required=False
    ),
    StandardAttributeSchemaField(
        name="cooling_energy", data_type=DataType.FLOAT, required=False
    ),
]

ahu_single_flux_schema = StandardAttributeSchema(
    key=AHU_SINGLE_FLUX_KEY,
    name="Single-Flux Air Handling Unit",
    fields=ahu_single_flux_fields,
)
