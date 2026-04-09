from pydantic import BaseModel

from devices_manager.core.standard_schemas import (
    StandardAttributeSchema as CoreStandardAttributeSchema,
)
from devices_manager.core.standard_schemas import (
    StandardAttributeSchemaField as CoreStandardAttributeSchemaField,
)
from devices_manager.types import DataType


class StandardAttributeSchemaField(BaseModel):
    name: str
    required: bool
    data_type: DataType
    multiple: bool = False


class StandardAttributeSchema(BaseModel):
    key: str
    name: str
    fields: list[StandardAttributeSchemaField]
    description: str | None = None


def core_to_dto(
    schema: CoreStandardAttributeSchema,
) -> StandardAttributeSchema:
    return StandardAttributeSchema(
        key=schema.key,
        name=schema.name,
        description=schema.description,
        fields=[_field_to_dto(f) for f in schema.fields],
    )


def _field_to_dto(
    field: CoreStandardAttributeSchemaField,
) -> StandardAttributeSchemaField:
    return StandardAttributeSchemaField(
        name=field.name,
        required=field.required,
        data_type=field.data_type,
        multiple=field.multiple,
    )
