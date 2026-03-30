from __future__ import annotations

from typing import Annotated, Any, Literal

from pydantic import BaseModel, Discriminator, Field, Tag

from devices_manager.core.device import (
    Attribute,
    DeviceBase,
    PhysicalDevice,
)
from devices_manager.types import DataType, DeviceKind, ReadWriteMode


class AttributeCreateDTO(BaseModel):
    name: str
    data_type: DataType
    read_write_mode: ReadWriteMode


class PhysicalDeviceCreateDTO(BaseModel):
    kind: Literal[DeviceKind.PHYSICAL] = DeviceKind.PHYSICAL
    name: Annotated[str, Field(default_factory=lambda: "")]
    config: dict
    driver_id: str
    transport_id: str


class VirtualDeviceCreateDTO(BaseModel):
    kind: Literal[DeviceKind.VIRTUAL] = DeviceKind.VIRTUAL
    name: Annotated[str, Field(default_factory=lambda: "")]
    attributes: list[AttributeCreateDTO]
    type: str | None = None


def _device_kind_discriminator(v: Any) -> str:  # noqa: ANN401
    """Return the device kind tag, defaulting to 'physical' when kind is absent."""
    if isinstance(v, dict):
        return v.get("kind", DeviceKind.PHYSICAL)
    return getattr(v, "kind", DeviceKind.PHYSICAL)


DeviceCreateDTO = Annotated[
    Annotated[PhysicalDeviceCreateDTO, Tag(DeviceKind.PHYSICAL)]
    | Annotated[VirtualDeviceCreateDTO, Tag(DeviceKind.VIRTUAL)],
    Discriminator(_device_kind_discriminator),
]


class DeviceDTO(BaseModel):
    id: str
    kind: DeviceKind
    name: str
    type: str | None = None
    attributes: dict[str, Attribute] = Field(default_factory=dict)
    # Physical-only fields — absent for virtual devices
    config: dict | None = None
    driver_id: str | None = None
    transport_id: str | None = None


class DeviceUpdateDTO(BaseModel):
    name: str | None = None
    config: dict | None = None
    transport_id: str | None = None
    driver_id: str | None = None


def core_to_dto(device: DeviceBase) -> DeviceDTO:
    if isinstance(device, PhysicalDevice):
        return DeviceDTO(
            id=device.id,
            kind=device.kind,
            name=device.name,
            config=device.config,
            driver_id=device.driver.id,
            transport_id=device.transport.id,
            type=device.type,
            attributes=device.attributes,
        )
    return DeviceDTO(
        id=device.id,
        kind=device.kind,
        name=device.name,
        type=device.type,
        attributes=device.attributes,
    )


def dto_to_base(dto: DeviceDTO) -> DeviceBase:
    """Convert a DeviceDTO back to a DeviceBase.

    Only keeps id + name (used for physical device bootstrapping).
    """
    return DeviceBase(
        id=dto.id,
        name=dto.name,
        kind=dto.kind,
        attributes={},
    )
