from collections.abc import Callable
from dataclasses import dataclass, field

from core.types import AttributeValueType


@dataclass
class DeviceConfigField:
    name: str
    required: bool = False


type ValueParser = Callable[[dict], AttributeValueType]


@dataclass
class AttributeSchema:
    name: str  # core side - the target attribute name
    protocol_key: str  # protocol side - the key used in the protocol
    value_parser: ValueParser | None = field(default=None)


@dataclass
class DeviceSchema:
    name: str
    device_config_fields: list[DeviceConfigField]
    attribute_schemas: list[AttributeSchema]

    def parse_value(
        self,
        attribute: str,
        transport_response: dict,
    ) -> AttributeValueType:
        attribute_schema = next(
            (s for s in self.attribute_schemas if s.name == attribute),
            None,
        )
        if attribute_schema is None or attribute_schema.value_parser is None:
            msg = f"No value parser defined for attribute '{attribute}'"
            raise ValueError(msg)
        return attribute_schema.value_parser(transport_response)
