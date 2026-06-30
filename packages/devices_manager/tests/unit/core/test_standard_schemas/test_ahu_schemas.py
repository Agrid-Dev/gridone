from dataclasses import dataclass

import pytest

from devices_manager.core.standard_schemas import validate_standard_schema
from devices_manager.core.standard_schemas.registry import default_registry
from devices_manager.core.standard_schemas.registry.ahu_double_flux import (
    AHU_DOUBLE_FLUX_KEY,
    ahu_double_flux_schema,
)
from devices_manager.core.standard_schemas.registry.ahu_single_flux import (
    AHU_SINGLE_FLUX_KEY,
    ahu_single_flux_schema,
)
from devices_manager.core.standard_schemas.registry.air_extractor import (
    AIR_EXTRACTOR_KEY,
    air_extractor_schema,
)
from devices_manager.core.standard_schemas.validate import ValidatedField
from devices_manager.types import DataType
from models.errors import InvalidError


@dataclass
class FakeField:
    name: str
    data_type: DataType


SCHEMAS = [air_extractor_schema, ahu_single_flux_schema, ahu_double_flux_schema]

# Independent spec of the mandatory attributes per AHU type (AGR-863).
EXPECTED_REQUIRED = {
    AIR_EXTRACTOR_KEY: set(),
    AHU_SINGLE_FLUX_KEY: {
        "supply_air_temperature",
        "supply_air_temperature_setpoint",
        "supply_fan_speed",
    },
    AHU_DOUBLE_FLUX_KEY: {
        "supply_air_temperature",
        "supply_air_temperature_setpoint",
        "supply_fan_speed",
        "extract_air_temperature",
        "extract_fan_speed",
    },
}

# Flip a field to a type the schema never expects, to trigger rejection.
_INCOMPATIBLE_TYPE = {
    DataType.FLOAT: DataType.BOOL,
    DataType.BOOL: DataType.FLOAT,
    DataType.INT: DataType.STRING,
    DataType.STRING: DataType.INT,
}


def _valid_fields(schema) -> list[ValidatedField]:
    return [FakeField(f.name, f.data_type) for f in schema.fields]


def _required_fields(schema) -> list:
    return [f for f in schema.fields if f.required]


@pytest.mark.parametrize("schema", SCHEMAS, ids=lambda s: s.key)
def test_schema_registered(schema):
    assert default_registry[schema.key] is schema


@pytest.mark.parametrize("schema", SCHEMAS, ids=lambda s: s.key)
def test_required_fields_match_spec(schema):
    actual = {f.name for f in schema.fields if f.required}
    assert actual == EXPECTED_REQUIRED[schema.key]


@pytest.mark.parametrize("schema", SCHEMAS, ids=lambda s: s.key)
def test_full_valid_attributes_accepted(schema):
    validate_standard_schema(schema.key, _valid_fields(schema))


@pytest.mark.parametrize("schema", SCHEMAS, ids=lambda s: s.key)
def test_only_required_attributes_accepted(schema):
    required: list[ValidatedField] = [
        FakeField(f.name, f.data_type) for f in _required_fields(schema)
    ]
    validate_standard_schema(schema.key, required)


@pytest.mark.parametrize("schema", SCHEMAS, ids=lambda s: s.key)
def test_extra_non_standard_attributes_accepted(schema):
    fields = [*_valid_fields(schema), FakeField("vendor_specific", DataType.STRING)]
    validate_standard_schema(schema.key, fields)


@pytest.mark.parametrize(
    ("key", "missing"),
    [(schema.key, f.name) for schema in SCHEMAS for f in _required_fields(schema)],
)
def test_missing_required_attribute_rejected(key, missing):
    schema = default_registry[key]
    fields = [f for f in _valid_fields(schema) if f.name != missing]
    with pytest.raises(InvalidError):
        validate_standard_schema(key, fields)


@pytest.mark.parametrize(
    ("key", "field_name", "data_type"),
    [
        (schema.key, f.name, f.data_type)
        for schema in SCHEMAS
        for f in _required_fields(schema)
    ],
)
def test_required_attribute_wrong_type_rejected(key, field_name, data_type):
    schema = default_registry[key]
    fields: list[ValidatedField] = [
        FakeField(
            f.name,
            _INCOMPATIBLE_TYPE[data_type] if f.name == field_name else f.data_type,
        )
        for f in _valid_fields(schema)
    ]
    with pytest.raises(InvalidError):
        validate_standard_schema(key, fields)
