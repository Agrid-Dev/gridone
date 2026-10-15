from dataclasses import dataclass

import pytest

from devices_manager.core.standard_schemas import validate_standard_schema
from devices_manager.core.standard_schemas.registry.electricity_meter import (
    ELECTRICITY_METER_KEY,
    electricity_meter_schema,
)
from devices_manager.core.standard_schemas.validate import ValidatedField
from devices_manager.types import DataType
from models.errors import InvalidError


@dataclass
class FakeField:
    name: str
    data_type: DataType


ALL_FIELDS: list[ValidatedField] = [
    FakeField("energy", DataType.FLOAT),
    FakeField("active_power", DataType.FLOAT),
    FakeField("reactive_power", DataType.FLOAT),
    FakeField("index", DataType.FLOAT),
]


def test_schema_is_registered():
    validate_standard_schema(ELECTRICITY_METER_KEY, ALL_FIELDS)


def test_schema_key():
    assert electricity_meter_schema.key == "electricity_meter"


def test_schema_covers_the_meter_contract():
    assert {f.name for f in electricity_meter_schema.fields} == {
        f.name for f in ALL_FIELDS
    }


@pytest.mark.parametrize("counter", ["energy", "index"])
def test_meter_validates_with_its_counter_under_either_name(counter):
    """While meters move from `energy` to `index`, a driver exposing its
    counter under either name stays valid."""
    validate_standard_schema(
        ELECTRICITY_METER_KEY,
        [FakeField(counter, DataType.FLOAT), FakeField("active_power", DataType.FLOAT)],
    )


@pytest.mark.parametrize("field_name", ["energy", "index"])
def test_wrong_data_type_raises(field_name):
    fields: list[ValidatedField] = [
        FakeField(f.name, DataType.STRING if f.name == field_name else f.data_type)
        for f in ALL_FIELDS
    ]
    with pytest.raises(InvalidError, match="to have type"):
        validate_standard_schema(ELECTRICITY_METER_KEY, fields)
