from __future__ import annotations

from dataclasses import dataclass
from typing import TYPE_CHECKING

from pydantic import BaseModel, ConfigDict, Field

from devices_manager.core.device import (
    AnyAttribute,
    CoreDevice,
    DeviceBase,
)
from devices_manager.core.revisions import revisions_of
from devices_manager.dto.presentation_dto import PresentationReference
from models.ids import gen_id
from models.metadata import ResourceMetadata
from models.tags import Tags  # noqa: TC001 -- pydantic validates this alias at runtime

if TYPE_CHECKING:
    from collections.abc import Callable, Mapping

    from devices_manager.core.driver import Driver
    from devices_manager.core.transports import TransportClient
    from devices_manager.types import AttributeKind


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
    tags: Tags = Field(default_factory=dict)
    attributes: dict[str, _AttributeUnion] = Field(default_factory=dict)
    # Derived from the device's fault attributes (rolled up by `core_to_dto`,
    # recomputed on sync). Defaulted so authored/stored payloads need not carry
    # it — a freshly loaded device reads False until its first sync.
    is_faulty: bool = False
    config: dict
    driver_id: str
    transport_id: str
    # Derived from the current driver, never persisted on the device snapshot.
    # ``driver_revision`` keys the documents served per driver (labels).
    driver_revision: str | None = None
    presentation_ref: PresentationReference | None = None
    write_state_revision: int = 0


class DeviceUpdate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    name: str | None = None
    config: dict | None = None
    transport_id: str | None = None
    driver_id: str | None = None


# Internal projections can omit write contracts and long texts. HTTP device
# listings and detail reads keep the complete attributes.
_OMITTED_FROM_SELECTION = dict.fromkeys(
    (
        "write_constraints",
        "write_state",
        "description",
        "user_confirmation",
        "default_value",
    )
)


@dataclass(frozen=True)
class AttributeSelection:
    """Internal projection of the attributes a service listing carries.

    Keeps the ones named, plus every
    attribute of the given kinds, each with its value and display fields but
    without its write contract or descriptions. An empty selection carries
    none, which is enough for counts, names and tags."""

    names: frozenset[str] = frozenset()
    kinds: frozenset[AttributeKind] = frozenset()

    def apply(self, attributes: Mapping[str, AnyAttribute]) -> dict[str, AnyAttribute]:
        return {
            name: attribute.model_copy(update=_OMITTED_FROM_SELECTION)
            for name, attribute in attributes.items()
            if name in self.names or attribute.kind in self.kinds
        }

    def restrict(self, device: Device) -> Device:
        """``device`` with only the selected attributes."""
        return device.model_copy(update={"attributes": self.apply(device.attributes)})


def core_to_dto(
    device: CoreDevice,
    *,
    attribute_selection: AttributeSelection | None = None,
) -> Device:
    """The public device. A selection trims its attributes, never what the
    header derives from them: ``is_faulty`` still reads every fault.

    The revisions are the registry's stamp on the driver."""
    device.project_write_states()
    revisions = revisions_of(device.driver)
    attributes = (
        device.attributes
        if attribute_selection is None
        else attribute_selection.apply(device.attributes)
    )
    return Device(
        id=device.id,
        name=device.name,
        config=device.config,
        driver_id=device.driver.id,
        transport_id=device.transport.id,
        type=device.type,
        tags=device.tags,
        attributes=attributes,
        write_state_revision=device.write_state_revision,
        is_faulty=device.is_faulty,
        created_at=device.created_at,
        updated_at=device.updated_at,
        driver_revision=revisions.driver,
        presentation_ref=(
            PresentationReference(revision=revisions.presentation)
            if revisions.presentation is not None
            else None
        ),
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
