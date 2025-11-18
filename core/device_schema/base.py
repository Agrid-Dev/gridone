from dataclasses import dataclass

from core.types import AttributeValueType, TransportProtocols

from .attribute_schema import AttributeSchema


@dataclass
class DeviceConfigField:
    name: str
    required: bool = True


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
        address: str | dict | None = None,
    ) -> AttributeSchema:
        if attribute_name is None and address is None:
            msg = "Either attribute_name or address must be provided"
            raise ValueError(msg)
        for schema in self.attribute_schemas:
            if attribute_name is not None and schema.attribute_name == attribute_name:
                return schema
            if address is not None and schema.address == address:
                return schema
        msg = (
            f"Attribute schema not found for attribute_name='{attribute_name}' "
            f"address='{address}'"
        )
        raise KeyError(msg)

    def parse_value(
        self,
        attribute: str,
        transport_response: dict,
    ) -> AttributeValueType:
        attribute_schema = self.get_attribute_schema(attribute_name=attribute)

        return attribute_schema.value_parser(transport_response)  # ty: ignore[invalid-argument-type]

    @classmethod
    def from_dict(
        cls,
        data: dict[str, str],
    ) -> "DeviceSchema":
        attribute_schemas = [
            AttributeSchema.from_dict(sch)  # ty: ignore[invalid-argument-type]
            for sch in data["attributes"]
        ]
        device_config_fields = [
            DeviceConfigField(**dfc)  # ty: ignore[invalid-argument-type]
            for dfc in data.get("device_config", {})
        ]
        return cls(
            name=data["name"],
            transport=TransportProtocols(data["transport"]),
            device_config_fields=device_config_fields,
            attribute_schemas=attribute_schemas,
        )
