from typing import Final

from devices_manager.core.standard_schemas import (
    StandardAttributeSchema,
    StandardAttributeSchemaField,
)
from devices_manager.types import DataType

AHU_DOUBLE_FLUX_KEY: Final = "ahu_double_flux"

# The required core (AGR-863) is deliberately minimal: what every double-flux
# unit measures. Everything else is optional and grounded in the points two
# controller families and an energy-valve product actually expose on deployed
# units, so that a synoptic can place each reading on the equipment it belongs
# to (filter, damper, coil loop, exchanger) instead of listing it generically.
#
# Faults (frost, smoke, fire damper, fan trips, discrepancies) stay out of the
# schema: alarms work on any attribute through `kind: fault`. The one exception
# is the filter state, named here so the synoptic can colour the filter it
# belongs to — drivers still declare `*_filter_clogged` with `kind: fault`, as
# `liquid_detector` does, so the alarm machinery picks it up unchanged.
ahu_double_flux_fields = [
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
    StandardAttributeSchemaField(
        name="extract_air_temperature", data_type=DataType.FLOAT, required=True
    ),
    StandardAttributeSchemaField(
        name="extract_fan_speed", data_type=DataType.FLOAT, required=True
    ),
    # --- Unit state ---------------------------------------------------------
    StandardAttributeSchemaField(
        name="onoff_state", data_type=DataType.BOOL, required=False
    ),
    StandardAttributeSchemaField(
        name="hvac_mode", data_type=DataType.STRING, required=False
    ),
    # On units regulating in a dead band, `supply_air_temperature_setpoint` is
    # the heating setpoint and this one the cooling setpoint.
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
        name="exhaust_air_temperature", data_type=DataType.FLOAT, required=False
    ),
    StandardAttributeSchemaField(
        name="supply_air_pressure", data_type=DataType.FLOAT, required=False
    ),
    StandardAttributeSchemaField(
        name="supply_air_pressure_setpoint", data_type=DataType.FLOAT, required=False
    ),
    StandardAttributeSchemaField(
        name="extract_air_pressure", data_type=DataType.FLOAT, required=False
    ),
    StandardAttributeSchemaField(
        name="extract_air_pressure_setpoint", data_type=DataType.FLOAT, required=False
    ),
    StandardAttributeSchemaField(
        name="supply_air_flow", data_type=DataType.FLOAT, required=False
    ),
    StandardAttributeSchemaField(
        name="supply_air_flow_setpoint", data_type=DataType.FLOAT, required=False
    ),
    StandardAttributeSchemaField(
        name="extract_air_flow", data_type=DataType.FLOAT, required=False
    ),
    StandardAttributeSchemaField(
        name="extract_air_flow_setpoint", data_type=DataType.FLOAT, required=False
    ),
    StandardAttributeSchemaField(
        name="supply_air_humidity", data_type=DataType.FLOAT, required=False
    ),
    StandardAttributeSchemaField(
        name="extract_air_humidity", data_type=DataType.FLOAT, required=False
    ),
    StandardAttributeSchemaField(
        name="extract_air_co2", data_type=DataType.FLOAT, required=False
    ),
    # --- Fans: air flow proven by a differential-pressure switch, as
    # `air_extractor.flow_switch` ------------------------------------------
    StandardAttributeSchemaField(
        name="supply_flow_switch", data_type=DataType.BOOL, required=False
    ),
    StandardAttributeSchemaField(
        name="extract_flow_switch", data_type=DataType.BOOL, required=False
    ),
    # --- Dampers: limit switches -------------------------------------------
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
        name="extract_filter_clogged", data_type=DataType.BOOL, required=False
    ),
    StandardAttributeSchemaField(
        name="supply_filter_differential_pressure",
        data_type=DataType.FLOAT,
        required=False,
    ),
    StandardAttributeSchemaField(
        name="extract_filter_differential_pressure",
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
    # --- Energy recovery ----------------------------------------------------
    StandardAttributeSchemaField(
        name="exchanger_utilization", data_type=DataType.FLOAT, required=False
    ),
    StandardAttributeSchemaField(
        name="exchanger_efficiency", data_type=DataType.FLOAT, required=False
    ),
]

ahu_double_flux_schema = StandardAttributeSchema(
    key=AHU_DOUBLE_FLUX_KEY,
    name="Double-Flux Air Handling Unit",
    fields=ahu_double_flux_fields,
)
