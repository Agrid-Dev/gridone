from dataclasses import dataclass

import pytest
from devices_manager.core.standard_schemas import (
    StandardAttributeSchema,
    StandardAttributeSchemaField,
    validate_standard_schema,
)
from devices_manager.types import DataType
from models.errors import InvalidError


@pytest.fixture
def test_schema() -> StandardAttributeSchema:
    return StandardAttributeSchema(
        fields=[
            StandardAttributeSchemaField(
                name="required_attr", data_type=DataType.FLOAT, required=True
            ),
            StandardAttributeSchemaField(
                name="optional_attr", data_type=DataType.FLOAT, required=False
            ),
        ]
    )


@dataclass
class FakeField:
    name: str
    data_type: DataType


@pytest.mark.parametrize(
    ("validated_schema"),
    [[], [FakeField(name="other", data_type=DataType.FLOAT)]],
)
def test_raises_for_missing_required_field(test_schema, validated_schema):
    with pytest.raises(InvalidError):
        validate_standard_schema(test_schema, validated_schema)


def test_does_not_raise_if_all_required_fields_present(test_schema):
    validate_standard_schema(
        test_schema,
        [FakeField(name="required_attr", data_type=DataType.FLOAT)],
    )


def test_raises_if_required_field_has_invalid_data_type(test_schema):
    with pytest.raises(InvalidError):
        validate_standard_schema(
            test_schema,
            [FakeField(name="required_attr", data_type=DataType.BOOL)],
        )


def test_raises_if_optional_field_present_with_invalid_data_type(test_schema):
    with pytest.raises(InvalidError):
        validate_standard_schema(
            test_schema,
            [
                FakeField(name="required_attr", data_type=DataType.FLOAT),
                FakeField(name="optional_attr", data_type=DataType.BOOL),
            ],
        )
