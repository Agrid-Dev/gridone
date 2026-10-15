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
    FakeField("index", DataType.FLOAT),
    FakeField("active_power", DataType.FLOAT),
    FakeField("reactive_power", DataType.FLOAT),
]


def test_schema_is_registered():
    validate_standard_schema(ELECTRICITY_METER_KEY, ALL_FIELDS)


def test_schema_key():
    assert electricity_meter_schema.key == "electricity_meter"


def test_schema_covers_the_meter_contract():
    assert {f.name for f in electricity_meter_schema.fields} == {
        f.name for f in ALL_FIELDS
    }


def test_only_index_is_required():
    assert [f.name for f in electricity_meter_schema.fields if f.required] == ["index"]


def test_index_alone_validates():
    validate_standard_schema(
        ELECTRICITY_METER_KEY, [FakeField("index", DataType.FLOAT)]
    )


def test_counter_named_energy_is_rejected():
    """`energy` was the counter's former name; a driver still using it must be
    renamed to `index`."""
    fields = [
        FakeField("energy", DataType.FLOAT),
        FakeField("active_power", DataType.FLOAT),
    ]
    with pytest.raises(InvalidError, match="Field index is required"):
        validate_standard_schema(ELECTRICITY_METER_KEY, fields)


@pytest.mark.parametrize("field_name", ["index", "active_power", "reactive_power"])
def test_wrong_data_type_raises(field_name):
    fields: list[ValidatedField] = [
        FakeField(f.name, DataType.STRING if f.name == field_name else f.data_type)
        for f in ALL_FIELDS
    ]
    with pytest.raises(InvalidError, match="to have type"):
        validate_standard_schema(ELECTRICITY_METER_KEY, fields)
