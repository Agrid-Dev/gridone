from typing import Annotated

import yaml as pyyaml
from core.driver import DeviceConfigField, Driver, DriverMetadata, UpdateStrategy
from core.types import TransportProtocols
from pydantic import BaseModel, Field

from .attribute_driver_dto import AttributeDriverDTO
from .attribute_driver_dto import core_to_dto as attribute_core_to_dto
from .attribute_driver_dto import dto_to_core as attribute_dto_to_core


class DriverDTO(BaseModel):
    id: Annotated[str, Field(min_length=1)]
    vendor: str | None = None
    model: str | None = None
    version: int | None = None
    transport: TransportProtocols
    env: Annotated[dict, Field(default_factory=dict)]
    update_strategy: UpdateStrategy = Field(default_factory=UpdateStrategy)
    device_config: list[DeviceConfigField]
    attributes: list[AttributeDriverDTO]
    discovery: dict | None = None

    @classmethod
    def from_yaml(cls, yaml: str) -> "DriverDTO":
        data = pyyaml.safe_load(yaml)
        return cls.model_validate(data)


class DriverYamlDTO(BaseModel):
    yaml: str


def core_to_dto(driver: Driver) -> DriverDTO:
    return DriverDTO(
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
    )


def dto_to_core(dto: DriverDTO) -> Driver:
    return Driver(
        metadata=DriverMetadata.model_validate(dto.model_dump()),
        transport=dto.transport,
        env=dto.env,
        device_config_required=dto.device_config,
        update_strategy=dto.update_strategy,
        attributes={a.name: attribute_dto_to_core(a) for a in dto.attributes},
        discovery_schema=dto.discovery,
    )
