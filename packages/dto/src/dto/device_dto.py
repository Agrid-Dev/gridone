from typing import Annotated

from core import Attribute, Device
from core.device import DeviceBase
from pydantic import BaseModel, Field


class DeviceCreateDTO(BaseModel):
    name: Annotated[str, Field(default_factory=lambda: "")]
    config: dict
    driver_id: str
    transport_id: str


class DeviceDTO(DeviceCreateDTO):
    id: str
    attributes: dict[str, Attribute] = Field(default_factory=dict)


class DeviceUpdateDTO(BaseModel):
    name: str | None = None
    config: dict | None = None
    transport_id: str | None = None
    driver_id: str | None = None


def core_to_dto(device: Device) -> DeviceDTO:
    return DeviceDTO(
        id=device.id,
        name=device.name,
        config=device.config,
        driver_id=device.driver.metadata.id,
        transport_id=device.transport.metadata.id,
        attributes=device.attributes,
    )


def dto_to_base(dto: DeviceDTO) -> DeviceBase:
    return DeviceBase(id=dto.id, name=dto.name, config=dto.config)
