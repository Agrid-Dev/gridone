from dataclasses import dataclass

from core.types import AttributeValueType, TransportProtocols

from .attribute_schema import AttributeSchema, DeviceConfigField


@dataclass
class DeviceSchema:
    name: str
    transport: TransportProtocols
    device_config_fields: list[DeviceConfigField]
    attribute_schemas: list[AttributeSchema]

    def get_attribute_schema(
        self,
        *,
        attribute_name: str | None = None,
        protocol_key: str | None = None,
    ) -> AttributeSchema:
        if attribute_name is None and protocol_key is None:
            msg = "Either attribute_name or protocol_key must be provided"
            raise ValueError(msg)
        for schema in self.attribute_schemas:
            if attribute_name is not None and schema.attribute_name == attribute_name:
                return schema
            if protocol_key is not None and schema.protocol_key == protocol_key:
                return schema
        msg = f"Attribute schema not found for attribute_name='{attribute_name}' protocol_key='{protocol_key}'"
        raise KeyError(msg)

    def parse_value(
        self,
        attribute: str,
        transport_response: dict,
    ) -> AttributeValueType:
        attribute_schema = self.get_attribute_schema(attribute_name=attribute)

        return attribute_schema.value_parser(transport_response)

    @classmethod
    def from_dict(
        cls,
        data: dict[str, str],
    ) -> "DeviceSchema":
        print(data)
        raise NotImplementedError("We're not finished here")
