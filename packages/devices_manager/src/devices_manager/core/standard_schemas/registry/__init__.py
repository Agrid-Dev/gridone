from devices_manager.core.standard_schemas.standard_schema import (
    StandardAttributeSchema,
    StandardAttributeSchemaRegistry,
)

from .awhp import awhp_schema
from .thermostat import thermostat_schema


def _build_registry(
    *schemas: StandardAttributeSchema,
) -> dict[str, StandardAttributeSchema]:
    return {schema.key: schema for schema in schemas}


default_registry: StandardAttributeSchemaRegistry = _build_registry(
    thermostat_schema,
    awhp_schema,
)
