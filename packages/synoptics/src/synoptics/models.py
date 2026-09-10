"""The synoptic document: what a plate is, independent of how it is drawn.

The document describes a plate, never a drawing. Screen coordinates, colours,
stroke styles and draw order are derived by the renderer from the document plus
the symbol kit, and are deliberately unexpressible here. See
``docs/specs/synoptic-document.md``.
"""

from enum import StrEnum
from typing import Annotated, Any, Literal

from pydantic import BaseModel, ConfigDict, Field, StringConstraints

from models.metadata import ResourceMetadata
from models.targets import AttributeTarget

SLUG_PATTERN = r"^[a-z0-9][a-z0-9_-]{0,63}$"

Slug = Annotated[str, StringConstraints(pattern=SLUG_PATTERN)]
"""An author-chosen element id, unique across the whole document.

Symbols, pipes, tags and labels share one namespace: pipes reference symbols
and other pipes by id, and ``pac-03`` reviews better than a 16-hex string.
"""

Side = Literal["+x", "-x", "+y", "-y", "+z", "-z"]
"""The face of a cell a pipe leaves through."""

Rotation = Annotated[int, Field(ge=0, le=3)]
"""Quarter turns counter-clockwise about the origin cell, in the xy plane."""

MAX_COORDINATE = 10_000
"""Bound on every coordinate, in cells (one cell is about a metre).

A run is expanded cell by cell to check what rides on it, so an unbounded
span turns a few hundred bytes of document into hours of CPU and an OOM.
Ten thousand cells each way is far larger than any plant room and leaves the
worst case in milliseconds. Bounding the floats also keeps ``inf`` and
``nan`` out, which are not JSON and which the database refuses.
"""

MAX_WAYPOINTS = 200
"""Corners a single run may author. The reference plate's longest run has five."""

MAX_POLYLINE_CELLS = 50_000
"""Cells every run of one document may cross, added together.

The coordinate bound caps one segment; it does not cap how many segments a
run or a document has. Without a total, a few hundred waypoints bouncing
across the grid still expand to millions of cells on the create path.
"""

Coordinate = Annotated[int, Field(ge=-MAX_COORDINATE, le=MAX_COORDINATE)]
FreeCoordinate = Annotated[
    float, Field(ge=-MAX_COORDINATE, le=MAX_COORDINATE, allow_inf_nan=False)
]


class Cell(BaseModel):
    """An integer grid cell. ``x`` right-and-down, ``y`` left-and-down, ``z`` up.

    Frozen so cells can be compared and used as set members, which is how the
    polyline rules check that a tag or an inline symbol sits on a run.
    """

    model_config = ConfigDict(extra="forbid", frozen=True)

    x: Coordinate
    y: Coordinate
    z: Coordinate = 0


class Point(BaseModel):
    """A free position, for labels only: they may sit between cells."""

    model_config = ConfigDict(extra="forbid", frozen=True)

    x: FreeCoordinate
    y: FreeCoordinate
    z: FreeCoordinate = 0.0


Projection = Literal["isometric", "flat"]
"""How the plate is drawn. ``flat`` is the same document with every ``z`` at 0."""

StaleAfter = Annotated[int, Field(ge=0)]
"""Seconds after which a resolved value is shown as stale."""


class Fluid(StrEnum):
    """What a pipe carries. Closed vocabulary owned by the format.

    The renderer keys its palette on the fluid; the document never names a
    colour. v1 is hydronic: air ducts and conductors reuse ``pipes`` with new
    values when those plates come.
    """

    PRIMARY_SUPPLY = "primary_supply"
    PRIMARY_RETURN = "primary_return"
    DHW = "dhw"
    DHW_LOOP = "dhw_loop"
    COLD_WATER = "cold_water"
    HEATING_SUPPLY = "heating_supply"
    HEATING_RETURN = "heating_return"
    CHILLED_SUPPLY = "chilled_supply"
    CHILLED_RETURN = "chilled_return"
    CONDENSER_SUPPLY = "condenser_supply"
    CONDENSER_RETURN = "condenser_return"


class AttributeSlot(BaseModel):
    """A live value: one attribute of one device, formatted.

    ``labels`` maps a stringified raw value to display text
    (``{"true": "MARCHE"}``) for bool, string and int attributes. Units and
    decimals live here because ``Attribute`` carries no unit, so the document is
    the only place "°C, one decimal" can be said; turning that into ``52,4 °C``
    is the renderer's job.
    """

    model_config = ConfigDict(extra="forbid")

    kind: Literal["attribute"] = "attribute"
    target: AttributeTarget
    unit: str | None = None
    decimals: int | None = Field(default=None, ge=0)
    labels: dict[str, str] | None = None
    stale_after: StaleAfter | None = None


class TextSlot(BaseModel):
    """A literal, reserved for facts no device exposes."""

    model_config = ConfigDict(extra="forbid")

    kind: Literal["text"] = "text"
    text: str


SlotValue = Annotated[AttributeSlot | TextSlot, Field(discriminator="kind")]


class CellPlacement(BaseModel):
    """Free-standing on the grid."""

    model_config = ConfigDict(extra="forbid")

    kind: Literal["cell"] = "cell"
    cell: Cell
    rotation: Rotation = 0


class PipePlacement(BaseModel):
    """Inline on a run, at a cell of that pipe's polyline (endpoints excluded).

    Valves, pumps and meters sit *in* a run: modelling each as a node with its
    own ports would split one departure into several pipes. Rotation follows
    the segment, so it is not authored.
    """

    model_config = ConfigDict(extra="forbid")

    kind: Literal["pipe"] = "pipe"
    pipe: Slug
    cell: Cell


Placement = Annotated[CellPlacement | PipePlacement, Field(discriminator="kind")]


class Symbol(BaseModel):
    """Equipment, an instrument or a link, placed on the plate."""

    model_config = ConfigDict(extra="forbid")

    id: Slug
    type: str
    placement: Placement
    label: str | None = None
    device_id: str | None = None
    props: dict[str, Any] = Field(default_factory=dict)
    bindings: dict[str, SlotValue] = Field(default_factory=dict)


class PortEndpoint(BaseModel):
    """A port of a symbol; the endpoint cell is the port's cell."""

    model_config = ConfigDict(extra="forbid")

    kind: Literal["port"] = "port"
    symbol: Slug
    port: str


class CellEndpoint(BaseModel):
    """A free cell: a run that starts or ends in the open."""

    model_config = ConfigDict(extra="forbid")

    kind: Literal["cell"] = "cell"
    cell: Cell


class PipeEndpoint(BaseModel):
    """A tee: a cell on another pipe's polyline.

    No junction symbol type is needed. The renderer draws the branch point and
    the editor snaps a pipe end onto a run.
    """

    model_config = ConfigDict(extra="forbid")

    kind: Literal["pipe"] = "pipe"
    pipe: Slug
    cell: Cell


Endpoint = Annotated[
    PortEndpoint | CellEndpoint | PipeEndpoint, Field(discriminator="kind")
]


class Tag(BaseModel):
    """A reading riding on a pipe at a cell of its run.

    Instrumentation that only reads is a tag; equipment that changes the fluid
    path is a symbol. A line code is a tag with no value.
    """

    model_config = ConfigDict(extra="forbid")

    id: Slug
    at: Cell
    label: str
    value: SlotValue | None = None


class Pipe(BaseModel):
    """A run between ports, cells and other pipes.

    The polyline is ``from``-cell, waypoints, ``to``-cell. ``flow`` animates the
    run when it resolves to ``true``; a pipe without ``flow`` is static.
    Animation is never inferred from an inline pump, which would animate the
    return of a loop whose pump is on the supply.

    ``flow`` takes the ``attribute`` arm only. A literal has nothing to resolve,
    so a ``text`` flow would reach production as a run that silently never
    animates; the resolver cannot catch it either, because there is no target to
    resolve. Whether the attribute is a bool is checked once it resolves.
    """

    model_config = ConfigDict(extra="forbid")

    id: Slug
    fluid: Fluid
    from_: Endpoint = Field(alias="from")
    to: Endpoint
    waypoints: list[Cell] = Field(default_factory=list, max_length=MAX_WAYPOINTS)
    flow: AttributeSlot | None = None
    tags: list[Tag] = Field(default_factory=list)


class Label(BaseModel):
    """Free-placed text. ``role`` is what the text is, so the kit can size it."""

    model_config = ConfigDict(extra="forbid")

    id: Slug
    at: Point
    text: str
    role: Literal["title", "caption", "note"]
    value: SlotValue | None = None


class SynopticDefaults(BaseModel):
    """Document-level defaults a binding may override."""

    model_config = ConfigDict(extra="forbid")

    stale_after: StaleAfter | None = None


class SynopticDocument(BaseModel):
    """A plate as authored: the create and import payload.

    Carries no ``id`` and no ``metadata``: those are service-assigned and live
    on :class:`Synoptic`.
    """

    model_config = ConfigDict(extra="forbid")

    version: Literal[1] = 1
    name: str = Field(min_length=1)
    description: str | None = None
    projection: Projection = "isometric"
    defaults: SynopticDefaults = Field(default_factory=SynopticDefaults)
    symbols: list[Symbol] = Field(default_factory=list)
    pipes: list[Pipe] = Field(default_factory=list)
    labels: list[Label] = Field(default_factory=list)


class Synoptic(SynopticDocument):
    """A stored plate: the authored document plus its service-assigned id."""

    id: str
    metadata: ResourceMetadata


ENVELOPE_FIELDS = {"id", "metadata"}
"""The fields :class:`Synoptic` adds to an authored document.

Excluding them from a dump yields the :class:`SynopticDocument` back, which
is how the storage layer splits a row and how the plate round-trip is
asserted.
"""


class SynopticSummary(BaseModel):
    """Lightweight read model returned by ``list``: the envelope only, so a
    plate index never parses thirty-four pipes per row."""

    model_config = ConfigDict(extra="forbid")

    id: str
    name: str
    description: str | None = None
    projection: Projection
    metadata: ResourceMetadata
