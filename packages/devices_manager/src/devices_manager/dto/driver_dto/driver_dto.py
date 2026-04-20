from typing import Annotated, Any

import yaml as pyyaml
from pydantic import BaseModel, Field, model_validator

from devices_manager.core.device.attribute import AttributeKind
from devices_manager.core.driver import (
    DeviceConfigField,
    Driver,
    DriverMetadata,
    UpdateStrategy,
)
from devices_manager.types import TransportProtocols

from .attribute_driver_dto import AttributeDriverSpec, FaultAttributeDriverSpec
from .attribute_driver_dto import core_to_dto as attribute_core_to_dto
from .attribute_driver_dto import dto_to_core as attribute_dto_to_core


class DriverSpec(BaseModel):
    id: Annotated[str, Field(min_length=1)]
    vendor: str | None = None
    model: str | None = None
    version: int | None = None
    transport: TransportProtocols
    env: Annotated[dict, Field(default_factory=dict)]
    update_strategy: UpdateStrategy = Field(default_factory=UpdateStrategy)
    device_config: list[DeviceConfigField]
    attributes: list[AttributeDriverSpec]
    discovery: dict | None = None
    type: str | None = None

    @model_validator(mode="before")
    @classmethod
    def fork_attributes_on_kind(cls, data: Any) -> Any:  # noqa: ANN401
        """Route each raw attribute entry to Standard/FaultAttributeDriverSpec.

        The `kind:` key in the YAML selects the concrete spec class so that
        fault-specific fields (severity, healthy_values) are only validated
        on fault entries. Pre-validated model instances and non-list inputs
        pass through untouched.
        """
        if not isinstance(data, dict):
            return data
        raw_attributes = data.get("attributes")
        if not isinstance(raw_attributes, list):
            return data
        parsed: list[AttributeDriverSpec] = []
        for item in raw_attributes:
            if isinstance(item, AttributeDriverSpec):
                parsed.append(item)
            elif isinstance(item, dict) and item.get("kind") == AttributeKind.FAULT:
                parsed.append(FaultAttributeDriverSpec.model_validate(item))
            else:
                parsed.append(AttributeDriverSpec.model_validate(item))
        data["attributes"] = parsed
        return data

    @classmethod
    def from_yaml(cls, yaml: str) -> "DriverSpec":
        data = pyyaml.safe_load(yaml)
        return cls.model_validate(data)


class DriverYaml(BaseModel):
    yaml: str


def core_to_dto(driver: Driver) -> DriverSpec:
    return DriverSpec(
        id=driver.metadata.id,
        vendor=driver.metadata.vendor,
        model=driver.metadata.model,
        version=driver.metadata.version,
        transport=driver.transport,
        env=driver.env,
        update_strategy=driver.update_strategy,
        device_config=driver.device_config_required,
        discovery=driver.discovery_schema,
        attributes=[
            attribute_core_to_dto(attribute) for attribute in driver.attributes.values()
        ],
        type=driver.type,
    )


def dto_to_core(dto: DriverSpec) -> Driver:
    return Driver(
        metadata=DriverMetadata.model_validate(dto.model_dump()),
        transport=dto.transport,
        env=dto.env,
        device_config_required=dto.device_config,
        update_strategy=dto.update_strategy,
        attributes={a.name: attribute_dto_to_core(a) for a in dto.attributes},
        discovery_schema=dto.discovery,
        type=dto.type,
    )
