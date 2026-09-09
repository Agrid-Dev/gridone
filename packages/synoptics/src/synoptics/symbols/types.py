"""What the registry knows about one symbol type."""

from collections.abc import Callable, Mapping
from dataclasses import dataclass, field

from pydantic import BaseModel

from synoptics.models import Cell, Side
from synoptics.symbols.props import NoProps


@dataclass(frozen=True)
class Port:
    """Where a pipe attaches to a symbol, and the face it leaves through.

    ``offset`` is relative to the symbol's origin cell, before rotation.
    """

    offset: Cell
    side: Side


@dataclass(frozen=True)
class Footprint:
    """The cells a symbol covers at rotation 0: ``[x, x+w) x [y, y+d)``.

    Size is on the type, not the instance: a symbol drawn by the design pass
    has one correct size on the grid, and letting instances resize it would
    fork the visual language plate by plate.
    """

    w: int
    d: int


@dataclass(frozen=True)
class SymbolType:
    """A registered symbol type.

    ``slots`` is the contract the document's ``bindings`` map is checked
    against: an unknown slot is an authoring error. ``inline`` says the type
    may be placed on a pipe rather than free-standing on the grid.

    ``ports_from_props`` exists for the collector alone, whose port positions
    are authored per instance (its ``ports`` mapping is therefore empty, and
    its ``footprint`` is ``None`` because its length comes from props).
    Such a type also sets ``rotation_locked``: its props already say which way
    it runs, and an instance rotation could only disagree with them.
    """

    type: str
    footprint: Footprint | None
    ports: Mapping[str, Port] = field(default_factory=dict)
    slots: tuple[str, ...] = ()
    required_slots: frozenset[str] = frozenset()
    inline: bool = False
    rotation_locked: bool = False
    # A003: ``type`` is the field's domain name; the annotation below still
    # resolves to the builtin, since a bare annotation binds no attribute.
    props_model: type[BaseModel] = NoProps  # noqa: A003
    ports_from_props: Callable[[BaseModel], Mapping[str, Port]] | None = None
