import re
from typing import Protocol

from models.errors import InvalidError

from devices_manager.types import DataType

from .registry import default_registry
from .standard_schema import (
    StandardAttributeSchema,
    StandardAttributeSchemaField,
    StandardAttributeSchemaRegistry,
)


class ValidatedField(Protocol):
    name: str
    data_type: DataType


def _find_matching_fields(
    standard_field: StandardAttributeSchemaField,
    validated_fields: list[ValidatedField],
) -> list[ValidatedField]:
    if not standard_field.multiple:
        return [f for f in validated_fields if f.name == standard_field.name]
    pattern = re.compile(rf"^{re.escape(standard_field.name)}_([1-9][0-9]*|[A-Z])$")
    return [f for f in validated_fields if pattern.match(f.name)]


def _validate_standard_field(
    standard_field: StandardAttributeSchemaField, validated_field: ValidatedField
) -> None:
    if validated_field.data_type != standard_field.data_type:
        msg = (
            f"Expected standard field {standard_field.name} to have type "
            f"{standard_field.data_type} but has {validated_field.data_type}"
        )
        raise InvalidError(msg)


def _validate_standard_schema(
    standard_schema: StandardAttributeSchema, validated_schema: list[ValidatedField]
) -> None:
    for standard_field in standard_schema.fields:
        matches = _find_matching_fields(standard_field, validated_schema)
        if not matches:
            if standard_field.required:
                msg = (
                    f"Field {standard_field.name} is required in standard schema "
                    "but missing"
                )
                raise InvalidError(msg)
        else:
            for matched in matches:
                _validate_standard_field(standard_field, matched)


def validate_standard_schema(
    schema_key: str,
    validated_schema: list[ValidatedField],
    *,
    registry: StandardAttributeSchemaRegistry = default_registry,
) -> None:
    if schema_key not in registry:
        msg = f"Standard schema {schema_key} is not registered"
        raise InvalidError(msg)
    return _validate_standard_schema(registry[schema_key], validated_schema)
