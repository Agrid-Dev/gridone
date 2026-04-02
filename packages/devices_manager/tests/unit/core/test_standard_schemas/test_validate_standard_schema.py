from dataclasses import dataclass

import pytest

from devices_manager.core.standard_schemas import (
    StandardAttributeSchema,
    StandardAttributeSchemaField,
    StandardAttributeSchemaRegistry,
    validate_standard_schema,
)
from devices_manager.types import DataType
from models.errors import InvalidError


@dataclass
class FakeField:
    name: str
    data_type: DataType


@pytest.fixture
def registry() -> StandardAttributeSchemaRegistry:
    return {
        "type_1": StandardAttributeSchema(
            key="type_1",
            name="Type 1",
            fields=[
                StandardAttributeSchemaField(
                    name="required_attr", data_type=DataType.FLOAT, required=True
                ),
                StandardAttributeSchemaField(
                    name="optional_attr", data_type=DataType.FLOAT, required=False
                ),
            ],
        ),
        # Schema with multiple-instance fields (e.g. per-circuit attributes)
        "type_2": StandardAttributeSchema(
            key="type_2",
            name="Type 2",
            fields=[
                StandardAttributeSchemaField(
                    name="temperature",
                    data_type=DataType.FLOAT,
                    required=True,
                    multiple=True,
                ),
                StandardAttributeSchemaField(
                    name="pressure",
                    data_type=DataType.FLOAT,
                    required=False,
                    multiple=True,
                ),
            ],
        ),
    }


def test_unregistered_schema_raises(registry):
    with pytest.raises(InvalidError):
        validate_standard_schema("unknown_type", [], registry=registry)


@pytest.mark.parametrize(
    "validated_schema",
    [[], [FakeField(name="other", data_type=DataType.FLOAT)]],
)
def test_missing_required_field_raises(registry, validated_schema):
    with pytest.raises(InvalidError):
        validate_standard_schema("type_1", validated_schema, registry=registry)


def test_all_required_fields_present_passes(registry):
    validate_standard_schema(
        "type_1",
        [FakeField(name="required_attr", data_type=DataType.FLOAT)],
        registry=registry,
    )


def test_required_field_wrong_data_type_raises(registry):
    with pytest.raises(InvalidError):
        validate_standard_schema(
            "type_1",
            [FakeField(name="required_attr", data_type=DataType.BOOL)],
            registry=registry,
        )


def test_optional_field_wrong_data_type_raises(registry):
    with pytest.raises(InvalidError):
        validate_standard_schema(
            "type_1",
            [
                FakeField(name="required_attr", data_type=DataType.FLOAT),
                FakeField(name="optional_attr", data_type=DataType.BOOL),
            ],
            registry=registry,
        )


def test_multiple_required_with_suffixed_fields_passes(registry):
    validate_standard_schema(
        "type_2",
        [
            FakeField(name="temperature_1", data_type=DataType.FLOAT),
            FakeField(name="temperature_2", data_type=DataType.FLOAT),
        ],
        registry=registry,
    )


def test_multiple_required_with_no_matches_raises(registry):
    with pytest.raises(InvalidError):
        validate_standard_schema("type_2", [], registry=registry)


def test_multiple_field_wrong_data_type_raises(registry):
    with pytest.raises(InvalidError):
        validate_standard_schema(
            "type_2",
            [
                FakeField(name="temperature_1", data_type=DataType.FLOAT),
                FakeField(name="temperature_2", data_type=DataType.BOOL),
            ],
            registry=registry,
        )


def test_multiple_with_mixed_numeric_and_letter_suffixes_passes(registry):
    validate_standard_schema(
        "type_2",
        [
            FakeField(name="temperature_1", data_type=DataType.FLOAT),
            FakeField(name="temperature_A", data_type=DataType.FLOAT),
            FakeField(name="temperature_B", data_type=DataType.FLOAT),
        ],
        registry=registry,
    )


def test_multiple_optional_absent_passes(registry):
    validate_standard_schema(
        "type_2",
        [FakeField(name="temperature_1", data_type=DataType.FLOAT)],
        registry=registry,
    )
