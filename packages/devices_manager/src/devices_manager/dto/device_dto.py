from __future__ import annotations

from typing import TYPE_CHECKING, Annotated, Any

from pydantic import BaseModel, ConfigDict, Discriminator, Field, Tag

from devices_manager.core.device import (
    Attribute,
    CoreDevice,
    DeviceBase,
    FaultAttribute,
)
from devices_manager.core.device.attribute import AttributeKind
from models.metadata import ResourceMetadata

if TYPE_CHECKING:
    from collections.abc import Callable

    from devices_manager.core.driver import Driver
    from devices_manager.core.transports import TransportClient


class DeviceCreate(BaseModel):
    name: Annotated[str, Field(default_factory=lambda: "")]
    config: dict
    driver_id: str
    transport_id: str


class DeviceBatchItem(BaseModel):
    name: Annotated[str, Field(default_factory=lambda: "")]
    config: dict


class DeviceBatchCreate(BaseModel):
    """Create many devices sharing one driver + transport, each with its own config."""

    driver_id: str
    transport_id: str
    devices: list[DeviceBatchItem]


def _attribute_kind_tag(v: Any) -> str:  # noqa: ANN401
    """Resolve the `kind` tag for discriminated-union dispatch.

    Defaults to `standard` when the field is absent — matches the default
    on `Attribute.kind` so payloads without an explicit `kind:` key parse
    as standard attributes.
    """
    if isinstance(v, dict):
        return v.get("kind", AttributeKind.STANDARD)
    return getattr(v, "kind", AttributeKind.STANDARD)


_AttributeUnion = Annotated[
    Annotated[Attribute, Tag(AttributeKind.STANDARD)]
    | Annotated[FaultAttribute, Tag(AttributeKind.FAULT)]
    | Annotated[Attribute, Tag(AttributeKind.INTERNAL)],
    Discriminator(_attribute_kind_tag),
]


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


class DeviceBatchItemResult(BaseModel):
    """Outcome of one entry in a batch create: either the created device or an error."""

    device: Device | None = None
    error: str | None = None


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
    """Convert a Device back to a DeviceBase constructor struct."""
    return DeviceBase(
        id=dto.id,
        name=dto.name,
        config=dto.config,
        created_at=dto.created_at,
        updated_at=dto.updated_at,
    )


def dto_to_core(
    dto: Device,
    drivers: dict[str, Driver],
    transports: dict[str, TransportClient],
    *,
    on_update: Callable[..., None] | None = None,
) -> CoreDevice:
    """Reconstruct a Device domain object from a stored Device."""
    driver = drivers[dto.driver_id]
    transport = transports[dto.transport_id]
    device = CoreDevice.from_base(
        dto_to_base(dto),
        driver=driver,
        transport=transport,
        restored_attributes=dto.attributes,
        on_update=on_update,
    )
    device.tags = dto.tags
    return device
