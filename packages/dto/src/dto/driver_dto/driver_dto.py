from typing import Annotated

from core.driver import DeviceConfigField, Driver, UpdateStrategy
from core.types import TransportProtocols
from pydantic import BaseModel, Field

from .attribute_driver_dto import AttributeDriverDTO
from .attribute_driver_dto import dto_to_core as attribute_dto_to_core


class DriverDTO(BaseModel):
    id: Annotated[str, Field(min_length=1)]
    vendor: str | None = None
    model: str | None = None
    version: int | None = None
    transport: TransportProtocols
    update_strategy: UpdateStrategy = Field(default_factory=UpdateStrategy)
    device_config: list[DeviceConfigField]
    attributes: list[AttributeDriverDTO]
    discovery: dict | None = None


def core_to_dto(driver: Driver) -> DriverDTO:
    return DriverDTO(
        id=driver.metadata.id,
        vendor=driver.metadata.vendor,
        model=driver.metadata.model,
        version=driver.metadata.version,
        transport=driver.transport,
        update_strategy=driver.update_strategy,
        device_config=driver.device_config_required,
        discovery=driver.discovery_schema,
        attributes=[
            attribute_dto_to_core(attribute) for attribute in driver.attributes.values()
        ],
    )
