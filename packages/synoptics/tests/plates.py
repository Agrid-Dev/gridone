# ruff: noqa: INP001 (importable helper module next to conftest, not a package)
"""The committed plates under ``docs/specs/synoptic/``, by file stem."""

import json
from pathlib import Path

from synoptics.models import (
    AttributeSlot,
    Endpoint,
    PipeEndpoint,
    SynopticDocument,
    TextSlot,
)
from synoptics.validation import bound_slots

PLATES_DIR = Path(__file__).parents[3] / "docs" / "specs" / "synoptic"
PLATE_NAMES = sorted(path.stem for path in PLATES_DIR.glob("*.json"))
"""Every committed plate, so a new one is held to the format's probes the
moment it lands next to the others."""


def read(name: str) -> dict:
    """A committed plate, straight off disk."""
    return json.loads((PLATES_DIR / f"{name}.json").read_text(encoding="utf-8"))


ECS_PLATES = tuple(
    name for name in PLATE_NAMES if read(name)["name"].startswith("Production ECS")
)
"""The hot-water bays, the same template each time: read off the plates, so a
third bay is held to the template's probes the moment it lands."""


def bound_device_ids(document: SynopticDocument) -> set[str]:
    """Every device a plate names: through a slot or as a symbol's own."""
    bound = {i for s in bound_slots(document) for i in s.slot.target.devices.ids or []}
    return bound | {s.device_id for s in document.symbols if s.device_id}


NOT_MEASURED = TextSlot(text="non mesurée")
"""A drawn reading no device reads (decision 2 of the plates)."""
NOT_IDENTIFIED = TextSlot(text="non identifiée")
"""A drawn reading a device reads but the plate cannot yet tell apart."""


def device_of(slot: AttributeSlot | TextSlot | None) -> str:
    """The one device an attribute slot names; a marker names none."""
    if not isinstance(slot, AttributeSlot):
        msg = f"not an attribute slot: {slot!r}"
        raise TypeError(msg)
    return (slot.target.devices.ids or [""])[0]


def joins(endpoint: Endpoint, pipe_id: str) -> bool:
    """Whether an endpoint tees onto the run *pipe_id*."""
    return isinstance(endpoint, PipeEndpoint) and endpoint.pipe == pipe_id


def shares_no_device_with_the_bays(document: SynopticDocument) -> bool:
    """A device id copied from a bay plate would read another plant and
    still validate."""
    return all(
        bound_device_ids(document).isdisjoint(
            bound_device_ids(SynopticDocument.model_validate(read(name)))
        )
        for name in ECS_PLATES
    )
