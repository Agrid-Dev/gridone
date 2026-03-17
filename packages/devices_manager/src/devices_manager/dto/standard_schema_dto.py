from pydantic import BaseModel

from devices_manager.core.standard_schemas import (
    StandardAttributeSchema,
    StandardAttributeSchemaField,
)
from devices_manager.types import DataType


class StandardAttributeSchemaFieldDTO(BaseModel):
    name: str
    required: bool
    data_type: DataType
    multiple: bool = False


class StandardAttributeSchemaDTO(BaseModel):
    key: str
    name: str
    fields: list[StandardAttributeSchemaFieldDTO]
    description: str | None = None


def core_to_dto(schema: StandardAttributeSchema) -> StandardAttributeSchemaDTO:
    return StandardAttributeSchemaDTO(
        key=schema.key,
        name=schema.name,
        description=schema.description,
        fields=[_field_to_dto(f) for f in schema.fields],
    )


def _field_to_dto(
    field: StandardAttributeSchemaField,
) -> StandardAttributeSchemaFieldDTO:
    return StandardAttributeSchemaFieldDTO(
        name=field.name,
        required=field.required,
        data_type=field.data_type,
        multiple=field.multiple,
    )
