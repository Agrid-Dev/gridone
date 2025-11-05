from dataclasses import dataclass

from core.types import DataType

from .value_parser import ValueParser


@dataclass
class DeviceConfigField:
    name: str
    required: bool = False


@dataclass
class AttributeSchema:
    attribute_name: str  # core side - the target attribute name
    data_type: DataType
    protocol_key: str  # protocol side - the key used in the protocol
    value_parser: ValueParser

    @classmethod
    def from_dict(cls, data: dict[str, str]) -> "AttributeSchema":
        raise NotImplementedError("Not implemented yet")
