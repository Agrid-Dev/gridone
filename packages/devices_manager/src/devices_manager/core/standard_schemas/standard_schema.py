from collections.abc import Mapping
from dataclasses import dataclass, field

from devices_manager.types import DataType


@dataclass
class StandardAttributeSchemaField:
    name: str
    required: bool
    data_type: DataType
    multiple: bool = False


@dataclass
class StandardAttributeSchema:
    key: str
    name: str
    fields: list[StandardAttributeSchemaField] = field(default_factory=list)
    description: str | None = None


StandardAttributeSchemaRegistry = Mapping[str, StandardAttributeSchema]
