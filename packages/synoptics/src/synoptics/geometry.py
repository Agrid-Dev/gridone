"""Cell arithmetic shared by the save-time rules.

Kept out of the models so it stays testable on its own: a pydantic validator
cannot be exercised without building a document around it, and the renderer
will need the same port and polyline maths later.
"""

from collections.abc import Sequence
from itertools import pairwise

from synoptics.models import Cell, Side

_SIDE_VECTORS: dict[Side, tuple[int, int, int]] = {
    "+x": (1, 0, 0),
    "-x": (-1, 0, 0),
    "+y": (0, 1, 0),
    "-y": (0, -1, 0),
    "+z": (0, 0, 1),
    "-z": (0, 0, -1),
}
_VECTOR_SIDES = {v: s for s, v in _SIDE_VECTORS.items()}


def rotate_offset(offset: Cell, rotation: int) -> Cell:
    """Turn *offset* ``rotation`` quarter turns counter-clockwise about the
    origin cell, in the xy plane. ``z`` is unaffected.

    Counter-clockwise in grid space is ``(x, y) -> (-y, x)``; the isometric
    projection's handedness is the renderer's business, not the document's.
    """
    x, y = offset.x, offset.y
    for _ in range(rotation % 4):
        x, y = -y, x
    return Cell(x=x, y=y, z=offset.z)


def rotate_side(side: Side, rotation: int) -> Side:
    """Turn a face by the same quarter turns as :func:`rotate_offset`."""
    vx, vy, vz = _SIDE_VECTORS[side]
    rotated = rotate_offset(Cell(x=vx, y=vy, z=vz), rotation)
    return _VECTOR_SIDES[(rotated.x, rotated.y, rotated.z)]


def translate(origin: Cell, offset: Cell) -> Cell:
    """The cell *offset* away from *origin*."""
    return Cell(x=origin.x + offset.x, y=origin.y + offset.y, z=origin.z + offset.z)


def is_axis_aligned(a: Cell, b: Cell) -> bool:
    """Whether the segment ``a -> b`` moves along exactly one axis.

    Zero-length segments are not aligned: they differ on no axis, so they
    cannot be drawn and are rejected with the diagonal ones.
    """
    return sum((a.x != b.x, a.y != b.y, a.z != b.z)) == 1


def direction(a: Cell, b: Cell) -> Side:
    """The face the axis-aligned segment ``a -> b`` leaves ``a`` through."""
    delta = (_unit(b.x - a.x), _unit(b.y - a.y), _unit(b.z - a.z))
    return _VECTOR_SIDES[delta]


def polyline_cells(corners: Sequence[Cell]) -> list[Cell]:
    """Every cell the run passes through, corners included.

    The document stores corners only, but a tag at ``(2,1)`` rides a segment
    running ``(1,1) -> (5,1)``, and an inline valve sits the same way. So "a
    cell on the pipe's polyline" means the cells the run actually crosses, not
    just the authored ones. Every segment must be axis-aligned
    (:func:`is_axis_aligned`); callers check that first.
    """
    cells = [corners[0]]
    for a, b in pairwise(corners):
        axis, step = _step(a, b)
        current = a
        while getattr(current, axis) != getattr(b, axis):
            current = current.model_copy(update={axis: getattr(current, axis) + step})
            cells.append(current)
    return cells


def _step(a: Cell, b: Cell) -> tuple[str, int]:
    """The axis an axis-aligned segment moves along, and its direction."""
    for axis in ("x", "y", "z"):
        delta = getattr(b, axis) - getattr(a, axis)
        if delta:
            return axis, _unit(delta)
    msg = "Zero-length segment has no direction"
    raise ValueError(msg)


def _unit(value: int) -> int:
    return (value > 0) - (value < 0)
