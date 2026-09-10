"""Cell arithmetic: rotation of ports, and what a run actually covers."""

import pytest

from synoptics.geometry import (
    direction,
    is_axis_aligned,
    polyline_cells,
    rotate_offset,
    rotate_side,
    translate,
)
from synoptics.models import Cell


@pytest.mark.parametrize(
    ("rotation", "expected"),
    [
        (0, (1, 2)),
        (1, (-2, 1)),
        (2, (-1, -2)),
        (3, (2, -1)),
        (4, (1, 2)),
    ],
)
def test_rotate_offset_turns_counter_clockwise(rotation, expected):
    rotated = rotate_offset(Cell(x=1, y=2, z=3), rotation)
    assert (rotated.x, rotated.y) == expected
    assert rotated.z == 3, "rotation is in the xy plane only"


@pytest.mark.parametrize(
    ("side", "rotation", "expected"),
    [
        ("+x", 1, "+y"),
        ("+y", 1, "-x"),
        ("-x", 1, "-y"),
        ("-y", 1, "+x"),
        ("+x", 2, "-x"),
        ("+z", 3, "+z"),
    ],
)
def test_rotate_side(side, rotation, expected):
    assert rotate_side(side, rotation) == expected


def test_translate():
    assert translate(Cell(x=5, y=-2), Cell(x=0, y=3, z=1)) == Cell(x=5, y=1, z=1)


@pytest.mark.parametrize(
    ("a", "b", "aligned"),
    [
        (Cell(x=0, y=0), Cell(x=3, y=0), True),
        (Cell(x=0, y=0), Cell(x=0, y=0, z=2), True),
        (Cell(x=0, y=0), Cell(x=3, y=3), False),
        (Cell(x=0, y=0), Cell(x=0, y=0), False),
    ],
)
def test_is_axis_aligned(a, b, aligned):
    assert is_axis_aligned(a, b) is aligned


@pytest.mark.parametrize(
    ("a", "b", "side"),
    [
        (Cell(x=0, y=0), Cell(x=4, y=0), "+x"),
        (Cell(x=4, y=0), Cell(x=0, y=0), "-x"),
        (Cell(x=0, y=0), Cell(x=0, y=2), "+y"),
        (Cell(x=0, y=0), Cell(x=0, y=0, z=1), "+z"),
    ],
)
def test_direction(a, b, side):
    assert direction(a, b) == side


def test_polyline_covers_the_cells_between_the_corners():
    """A tag rides a cell the run crosses, not only a cell it was authored at,
    so the polyline has to be expanded before anything is checked against it."""
    cells = polyline_cells([Cell(x=1, y=1), Cell(x=4, y=1)])
    assert cells == [
        Cell(x=1, y=1),
        Cell(x=2, y=1),
        Cell(x=3, y=1),
        Cell(x=4, y=1),
    ]


def test_polyline_turns_corners_and_climbs():
    cells = polyline_cells(
        [Cell(x=0, y=0), Cell(x=2, y=0), Cell(x=2, y=0, z=1), Cell(x=2, y=2, z=1)]
    )
    assert cells == [
        Cell(x=0, y=0),
        Cell(x=1, y=0),
        Cell(x=2, y=0),
        Cell(x=2, y=0, z=1),
        Cell(x=2, y=1, z=1),
        Cell(x=2, y=2, z=1),
    ]


def test_polyline_of_a_single_corner_is_that_cell():
    assert polyline_cells([Cell(x=7, y=7)]) == [Cell(x=7, y=7)]
