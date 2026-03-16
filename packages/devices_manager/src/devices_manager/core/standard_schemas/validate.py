from typing import Protocol

from models.errors import InvalidError

from devices_manager.types import DataType

from .standard_schema import StandardAttributeSchema, StandardAttributeSchemaField


class ValidatedField(Protocol):
    name: str
    data_type: DataType


def _validate_standard_field(
    standard_field: StandardAttributeSchemaField, validated_field: ValidatedField
) -> None:
    if validated_field.data_type != standard_field.data_type:
        msg = (
            f"Expected standard field {standard_field.name} to have type "
            f"{standard_field.data_type} but has {validated_field.data_type}"
        )
        raise InvalidError(msg)


def validate_standard_schema(
    standard_schema: StandardAttributeSchema, validated_schema: list[ValidatedField]
) -> None:
    validated_by_name = {f.name: f for f in validated_schema}
    for standard_field in standard_schema.fields:
        validated_field = validated_by_name.get(standard_field.name)
        if validated_field is None:
            if standard_field.required:
                msg = (
                    f"Field {standard_field.name} is required in standard schema "
                    "but missing"
                )
                raise InvalidError(msg)
        else:
            _validate_standard_field(standard_field, validated_field)
