from devices_manager.core.standard_schemas.standard_schema import (
    StandardAttributeSchema,
    StandardAttributeSchemaRegistry,
)

from .ahu_double_flux import ahu_double_flux_schema
from .ahu_single_flux import ahu_single_flux_schema
from .air_extractor import air_extractor_schema
from .awhp import awhp_schema
from .electricity_meter import electricity_meter_schema
from .thermostat import thermostat_schema
from .weather_sensor import weather_sensor_schema


def _build_registry(
    *schemas: StandardAttributeSchema,
) -> dict[str, StandardAttributeSchema]:
    return {schema.key: schema for schema in schemas}


default_registry: StandardAttributeSchemaRegistry = _build_registry(
    thermostat_schema,
    awhp_schema,
    weather_sensor_schema,
    electricity_meter_schema,
    air_extractor_schema,
    ahu_single_flux_schema,
    ahu_double_flux_schema,
)
