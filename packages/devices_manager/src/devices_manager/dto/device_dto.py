from __future__ import annotations

from typing import TYPE_CHECKING

from pydantic import BaseModel, ConfigDict, Field

from devices_manager.core.device import (
    AnyAttribute,
    CoreDevice,
    DeviceBase,
)
from models.ids import gen_id
from models.metadata import ResourceMetadata

if TYPE_CHECKING:
    from collections.abc import Callable

    from devices_manager.core.driver import Driver
    from devices_manager.core.transports import TransportClient


# A device may be created nameless (labelled later), so name defaults to "".
_DEFAULT_DEVICE_NAME = ""


class DeviceCreate(BaseModel):
    name: str = _DEFAULT_DEVICE_NAME
    config: dict
    driver_id: str
    transport_id: str


# The wire shape of a device attribute is the core discriminated union
# itself — attributes are embedded core objects, not a separate projection.
_AttributeUnion = AnyAttribute


class Device(ResourceMetadata):
    id: str
    name: str
    type: str | None = None
    tags: dict[str, str] = Field(default_factory=dict)
    attributes: dict[str, _AttributeUnion] = Field(default_factory=dict)
    # Derived from the device's fault attributes (rolled up by `core_to_dto`,
    # recomputed on sync). Defaulted so authored/stored payloads need not carry
    # it — a freshly loaded device reads False until its first sync.
    is_faulty: bool = False
    config: dict
    driver_id: str
    transport_id: str


class DeviceUpdate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    name: str | None = None
    config: dict | None = None
    transport_id: str | None = None
    driver_id: str | None = None


def core_to_dto(device: CoreDevice) -> Device:
    return Device(
        id=device.id,
        name=device.name,
        config=device.config,
        driver_id=device.driver.id,
        transport_id=device.transport.id,
        type=device.type,
        tags=device.tags,
        attributes=device.attributes,
        is_faulty=device.is_faulty,
        created_at=device.created_at,
        updated_at=device.updated_at,
    )


def dto_to_base(dto: Device) -> DeviceBase:
    """Convert a Device back to a DeviceBase detached snapshot."""
    return DeviceBase(
        id=dto.id,
        name=dto.name,
        config=dto.config,
        driver_id=dto.driver_id,
        transport_id=dto.transport_id,
        tags=dto.tags,
        attributes=dto.attributes,
        created_at=dto.created_at,
        updated_at=dto.updated_at,
    )


def create_to_base(create: DeviceCreate) -> DeviceBase:
    """Build a fresh device snapshot from a create payload: new id,
    default timestamps, no restored state."""
    return DeviceBase(
        id=gen_id(),
        name=create.name,
        config=create.config,
        driver_id=create.driver_id,
        transport_id=create.transport_id,
    )


def dto_to_core(
    dto: Device,
    drivers: dict[str, Driver],
    transports: dict[str, TransportClient],
    *,
    on_update: Callable[..., None] | None = None,
) -> CoreDevice:
    """Reconstruct a Device domain object from a stored Device."""
    return CoreDevice.from_base(
        dto_to_base(dto),
        driver=drivers[dto.driver_id],
        transport=transports[dto.transport_id],
        on_update=on_update,
    )
