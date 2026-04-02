from dataclasses import dataclass

import pytest

from devices_manager.core.standard_schemas import validate_standard_schema
from devices_manager.core.standard_schemas.registry.weather_sensor import (
    WEATHER_SENSOR_KEY,
    weather_sensor_schema,
)
from devices_manager.core.standard_schemas.validate import ValidatedField
from devices_manager.types import DataType
from models.errors import InvalidError


@dataclass
class FakeField:
    name: str
    data_type: DataType


ALL_FIELDS: list[ValidatedField] = [
    FakeField("temperature", DataType.FLOAT),
    FakeField("weather_code", DataType.INT),
    FakeField("wind_speed", DataType.FLOAT),
    FakeField("wind_direction", DataType.INT),
    FakeField("humidity", DataType.FLOAT),
]


def test_schema_is_registered():
    validate_standard_schema(WEATHER_SENSOR_KEY, ALL_FIELDS)


def test_schema_key():
    assert weather_sensor_schema.key == "weather_sensor"


def test_schema_has_five_required_fields():
    assert len(weather_sensor_schema.fields) == 5
    assert all(f.required for f in weather_sensor_schema.fields)


@pytest.mark.parametrize(
    "missing_field",
    ["temperature", "weather_code", "wind_speed", "wind_direction", "humidity"],
)
def test_missing_required_field_raises(missing_field):
    fields = [f for f in ALL_FIELDS if f.name != missing_field]
    with pytest.raises(InvalidError):
        validate_standard_schema(WEATHER_SENSOR_KEY, fields)


@pytest.mark.parametrize(
    ("field_name", "wrong_type"),
    [
        ("temperature", DataType.INT),
        ("weather_code", DataType.FLOAT),
        ("wind_speed", DataType.BOOL),
        ("wind_direction", DataType.FLOAT),
        ("humidity", DataType.STRING),
    ],
)
def test_wrong_data_type_raises(field_name, wrong_type):
    fields: list[ValidatedField] = [
        FakeField(
            f.name,
            wrong_type if f.name == field_name else f.data_type,
        )
        for f in ALL_FIELDS
    ]
    with pytest.raises(InvalidError):
        validate_standard_schema(WEATHER_SENSOR_KEY, fields)
