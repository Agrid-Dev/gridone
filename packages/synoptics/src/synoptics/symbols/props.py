"""Per-type static configuration models.

``props`` is type-specific authoring data that is not a binding and not a
position: a tank's capacity, a link's target. Most types have none.
"""

from typing import Annotated, Literal, Self

from pydantic import (
    BaseModel,
    ConfigDict,
    Field,
    StringConstraints,
    model_validator,
)

from synoptics.models import Side


class SymbolProps(BaseModel):
    """Base for every type's props model.

    ``extra="forbid"`` so a typo in an authored plate is a save-time error
    rather than a silently ignored key. ``strict`` because props are persisted
    verbatim and read back by consumers that hold no registry: under lax
    coercion a plate authored with ``"9"`` would validate as an int here and
    still store a string, leaving validation and storage disagreeing about what
    was saved.
    """

    model_config = ConfigDict(extra="forbid", strict=True)


class NoProps(SymbolProps):
    """For types that declare none."""


class TankProps(SymbolProps):
    capacity: str


class LinkProps(SymbolProps):
    """A folio link or an off-plate boundary.

    ``synoptic_id`` set: clicking navigates. Unset: an inert labelled boundary.
    The target's existence is deliberately never checked at save time — the
    first plate links to plates that do not exist yet.
    """

    synoptic_id: str | None = None
    caption: str | None = None


class CollectorPort(SymbolProps):
    """A port authored on a collector: how far along the bar, and which face.

    Inlets and outlets are not on opposite faces in general — a return
    collector can take its inlets from the north and let its outlet out west,
    along the bar.
    """

    offset: int = Field(ge=0)
    side: Side


CollectorPortName = Annotated[str, StringConstraints(pattern=r"^(in|out)_[1-9][0-9]*$")]
"""A collector port name: ``in_1``, ``out_2``.

The type owns the naming and the instance owns only the positions, so an
authored key outside this shape is a save-time error rather than a port no
consumer knows how to read.
"""


class CollectorProps(SymbolProps):
    """The collector is the one type whose shape is authored per instance: a
    bar serving three departures is not the same shape as one serving eight.

    ``axis`` says which way the bar runs, which is why ``rotation`` must be 0 on
    a collector — having both would let them disagree.
    """

    axis: Literal["x", "y"]
    length: int = Field(ge=2)
    ports: dict[CollectorPortName, CollectorPort]

    @model_validator(mode="after")
    def _ports_fit_the_bar(self) -> Self:
        """Every port sits on the bar it is authored for.

        Without this ``length`` is validated and then read by nothing, and a
        three-cell collector accepts a port ninety-six cells past its end — a
        run the renderer would draw departing from empty space.
        """
        for name, port in self.ports.items():
            if port.offset >= self.length:
                msg = (
                    f"Port {name!r} sits at offset {port.offset} on a bar of "
                    f"length {self.length}"
                )
                raise ValueError(msg)
        return self
