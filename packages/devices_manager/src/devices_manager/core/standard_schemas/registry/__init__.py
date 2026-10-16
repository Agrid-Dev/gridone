from devices_manager.core.standard_schemas.standard_schema import (
    StandardAttributeSchema,
    StandardAttributeSchemaRegistry,
)

from .ahu_double_flux import ahu_double_flux_schema
from .ahu_single_flux import ahu_single_flux_schema
from .air_extractor import air_extractor_schema
from .awhp import awhp_schema
from .electricity_meter import electricity_meter_schema
from .liquid_detector import liquid_detector_schema
from .pms_monitor import pms_monitor_schema
from .pump import pump_schema
from .thermostat import thermostat_schema
from .weather_sensor import weather_sensor_schema


def _build_registry(
    *schemas: StandardAttributeSchema,
) -> dict[str, StandardAttributeSchema]:
    return {schema.key: schema for schema in schemas}


OTHER_TYPE = "other"
"""The type bucket of a device whose type is not in the catalog, or unset.

A filter value (``types=["other"]``) and a facet key alike: the one word for
"outside the standard catalog" on the wire.
"""


def type_bucket(device_type: str | None) -> str:
    """A standard type stays itself; anything else is ``OTHER_TYPE``."""
    return device_type if device_type in default_registry else OTHER_TYPE


default_registry: StandardAttributeSchemaRegistry = _build_registry(
    thermostat_schema,
    awhp_schema,
    weather_sensor_schema,
    electricity_meter_schema,
    air_extractor_schema,
    ahu_single_flux_schema,
    ahu_double_flux_schema,
    pms_monitor_schema,
    liquid_detector_schema,
    pump_schema,
)
