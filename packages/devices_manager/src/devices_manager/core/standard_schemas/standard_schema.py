from dataclasses import dataclass, field

from devices_manager.types import DataType


@dataclass
class StandardAttributeSchemaField:
    name: str
    required: bool
    data_type: DataType


@dataclass
class StandardAttributeSchema:
    fields: list[StandardAttributeSchemaField] = field(default_factory=list)
