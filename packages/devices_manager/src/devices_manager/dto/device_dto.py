from __future__ import annotations

from typing import TYPE_CHECKING, Annotated, Any, Literal

from pydantic import BaseModel, ConfigDict, Discriminator, Field, Tag

from devices_manager.core.device import (
    Attribute,
    CoreDevice,
    DeviceBase,
    PhysicalDevice,
    VirtualDevice,
)
from devices_manager.types import DataType, DeviceKind, ReadWriteMode

if TYPE_CHECKING:
    from collections.abc import Callable

    from devices_manager.core.driver import Driver
    from devices_manager.core.transports import TransportClient


class AttributeCreate(BaseModel):
    name: str
    data_type: DataType
    read_write_mode: ReadWriteMode


class PhysicalDeviceCreate(BaseModel):
    kind: Literal[DeviceKind.PHYSICAL] = DeviceKind.PHYSICAL
    name: Annotated[str, Field(default_factory=lambda: "")]
    config: dict
    driver_id: str
    transport_id: str


class VirtualDeviceCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")
    kind: Literal[DeviceKind.VIRTUAL] = DeviceKind.VIRTUAL
    name: Annotated[str, Field(default_factory=lambda: "")]
    attributes: list[AttributeCreate]
    type: str | None = None


def _device_kind_discriminator(v: Any) -> str:  # noqa: ANN401
    """Return the device kind tag, defaulting to 'physical' when kind is absent."""
    if isinstance(v, dict):
        return v.get("kind", DeviceKind.PHYSICAL)
    return getattr(v, "kind", DeviceKind.PHYSICAL)


DeviceCreate = Annotated[
    Annotated[PhysicalDeviceCreate, Tag(DeviceKind.PHYSICAL)]
    | Annotated[VirtualDeviceCreate, Tag(DeviceKind.VIRTUAL)],
    Discriminator(_device_kind_discriminator),
]


class Device(BaseModel):
    id: str
    kind: DeviceKind = DeviceKind.PHYSICAL
    name: str
    type: str | None = None
    tags: dict[str, list[str]] = Field(default_factory=dict)
    attributes: dict[str, Attribute] = Field(default_factory=dict)
    # Physical-only fields — absent for virtual devices
    config: dict | None = None
    driver_id: str | None = None
    transport_id: str | None = None


class DeviceUpdate(BaseModel):
    name: str | None = None
    config: dict | None = None
    transport_id: str | None = None
    driver_id: str | None = None
    attributes: list[AttributeCreate] | None = None
    tags: dict[str, list[str]] | None = None


def core_to_dto(device: CoreDevice) -> Device:
    if isinstance(device, PhysicalDevice):
        return Device(
            id=device.id,
            kind=device.kind,
            name=device.name,
            config=device.config,
            driver_id=device.driver.id,
            transport_id=device.transport.id,
            type=device.type,
            tags=device.tags,
            attributes=device.attributes,
        )
    return Device(
        id=device.id,
        kind=device.kind,
        name=device.name,
        type=device.type,
        tags=device.tags,
        attributes=device.attributes,
    )


def dto_to_base(dto: Device) -> DeviceBase:
    """Convert a Device back to a DeviceBase constructor struct."""
    return DeviceBase(
        id=dto.id,
        name=dto.name,
        config=dto.config or {},
    )


def dto_to_core(
    dto: Device,
    drivers: dict[str, Driver],
    transports: dict[str, TransportClient],
    *,
    on_update: Callable[..., None] | None = None,
) -> CoreDevice:
    """Reconstruct a Device domain object from a stored Device."""
    if dto.kind == DeviceKind.VIRTUAL:
        return VirtualDevice(
            id=dto.id,
            name=dto.name,
            type=dto.type,
            tags=dto.tags,
            attributes=dto.attributes,
            on_update=on_update,
        )
    driver = drivers[dto.driver_id]  # type: ignore[index]
    transport = transports[dto.transport_id]  # type: ignore[index]
    initial_values = {
        name: attr.current_value
        for name, attr in dto.attributes.items()
        if attr.current_value is not None
    }
    device = PhysicalDevice.from_base(
        DeviceBase(id=dto.id, name=dto.name, config=dto.config or {}),
        driver=driver,
        transport=transport,
        initial_values=initial_values or None,
        on_update=on_update,
    )
    device.tags = dto.tags
    return device
