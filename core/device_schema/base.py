from dataclasses import dataclass

from pydantic import BaseModel

from core.types import TransportProtocols

from .attribute_schema import AttributeSchema


@dataclass
class DeviceConfigField:
    name: str
    required: bool = True


class DeviceSchema(BaseModel):
    name: str
    transport: TransportProtocols
    device_config_fields: list[DeviceConfigField]
    attribute_schemas: list[AttributeSchema]

    def get_attribute_schema(
        self,
        *,
        attribute_name: str,
    ) -> AttributeSchema:
        try:
            return next(
                schema
                for schema in self.attribute_schemas
                if schema.name == attribute_name
            )
        except StopIteration as e:
            msg = f"Attribute schema not found for attribute_name='{attribute_name}' "
            raise ValueError(msg) from e

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
