from dataclasses import dataclass
from typing import Any

from pydantic import BaseModel, Field

from core.types import TransportProtocols

from .attribute_schema import AttributeSchema
from .update_strategy import UpdateStrategy


@dataclass
class DeviceConfigField:
    name: str
    required: bool = True


class DriverSchema(BaseModel):
    name: str
    transport: TransportProtocols
    update_strategy: UpdateStrategy = Field(default_factory=UpdateStrategy)
    device_config_fields: list[DeviceConfigField]
    attribute_schemas: list[AttributeSchema]
    discovery: dict | None

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
        data: dict[str, Any],
    ) -> "DriverSchema":
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
            update_strategy=data.get("update_strategy", {}),
            discovery=data.get("discovery"),
        )
