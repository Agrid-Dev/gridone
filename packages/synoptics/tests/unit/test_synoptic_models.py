"""The document models: unions, aliases and the fields the format pins."""

import pytest
from pydantic import ValidationError

from synoptics.models import (
    AttributeSlot,
    Cell,
    CellEndpoint,
    CellPlacement,
    Pipe,
    PipeEndpoint,
    PipePlacement,
    Point,
    PortEndpoint,
    Symbol,
    SynopticDocument,
    Tag,
    TextSlot,
)


def test_version_is_pinned_to_one():
    with pytest.raises(ValidationError):
        SynopticDocument.model_validate({"version": 2, "name": "x"})


def test_a_document_defaults_to_an_empty_isometric_plate():
    document = SynopticDocument.model_validate({"name": "Empty"})
    assert document.projection == "isometric"
    assert (document.symbols, document.pipes, document.labels) == ([], [], [])
    assert document.defaults.stale_after is None


def test_unknown_keys_are_rejected():
    with pytest.raises(ValidationError):
        SynopticDocument.model_validate({"name": "x", "theme": "dark"})


@pytest.mark.parametrize(
    ("raw", "expected"),
    [
        ({"kind": "cell", "cell": {"x": 0, "y": 0}}, CellPlacement),
        ({"kind": "pipe", "pipe": "supply", "cell": {"x": 1, "y": 0}}, PipePlacement),
    ],
)
def test_placement_is_discriminated_on_kind(raw, expected):
    symbol = Symbol.model_validate({"id": "s", "type": "pump", "placement": raw})
    assert isinstance(symbol.placement, expected)


@pytest.mark.parametrize(
    ("raw", "expected"),
    [
        ({"kind": "port", "symbol": "pac-01", "port": "supply"}, PortEndpoint),
        ({"kind": "cell", "cell": {"x": 0, "y": 0}}, CellEndpoint),
        ({"kind": "pipe", "pipe": "supply", "cell": {"x": 0, "y": 0}}, PipeEndpoint),
    ],
)
def test_endpoint_is_discriminated_on_kind(raw, expected):
    pipe = Pipe.model_validate(
        {
            "id": "p",
            "fluid": "dhw",
            "from": raw,
            "to": {"kind": "cell", "cell": {"x": 9, "y": 0}},
        }
    )
    assert isinstance(pipe.from_, expected)


def test_a_pipes_from_keeps_its_authored_name():
    """``from`` is a reserved word in python, so the field is ``from_`` and the
    alias carries the authored spelling in both directions."""
    raw = {
        "id": "p",
        "fluid": "dhw",
        "from": {"kind": "cell", "cell": {"x": 0, "y": 0}},
        "to": {"kind": "cell", "cell": {"x": 4, "y": 0}},
    }
    pipe = Pipe.model_validate(raw)
    dumped = pipe.model_dump(mode="json", by_alias=True, exclude_defaults=True)
    assert "from" in dumped
    assert "from_" not in dumped


def test_a_slot_is_a_live_value_or_a_literal():
    attribute = AttributeSlot.model_validate(
        {
            "kind": "attribute",
            "target": {"devices": {"ids": ["dev-1"]}, "attribute": "temperature"},
            "unit": "°C",
            "decimals": 1,
        }
    )
    assert attribute.target.attribute == "temperature"
    assert TextSlot(text="55 °C").text == "55 °C"


def test_a_binding_maps_raw_values_to_display_text():
    slot = AttributeSlot.model_validate(
        {
            "kind": "attribute",
            "target": {"devices": {"ids": ["dev-1"]}, "attribute": "onoff_state"},
            "labels": {"true": "MARCHE", "false": "ARRÊT"},
        }
    )
    assert slot.labels == {"true": "MARCHE", "false": "ARRÊT"}


def test_decimals_cannot_be_negative():
    with pytest.raises(ValidationError):
        AttributeSlot.model_validate(
            {
                "kind": "attribute",
                "target": {"devices": {"ids": ["d"]}, "attribute": "t"},
                "decimals": -1,
            }
        )


@pytest.mark.parametrize("rotation", [-1, 4])
def test_rotation_is_a_quarter_turn(rotation):
    with pytest.raises(ValidationError):
        CellPlacement.model_validate(
            {"kind": "cell", "cell": {"x": 0, "y": 0}, "rotation": rotation}
        )


def test_flow_takes_the_attribute_arm_only():
    """A literal has nothing to resolve, so a text flow would reach production
    as a run that silently never animates."""
    with pytest.raises(ValidationError):
        Pipe.model_validate(
            {
                "id": "p",
                "fluid": "dhw",
                "from": {"kind": "cell", "cell": {"x": 0, "y": 0}},
                "to": {"kind": "cell", "cell": {"x": 4, "y": 0}},
                "flow": {"kind": "text", "text": "oui"},
            }
        )


def test_flow_accepts_a_live_value():
    pipe = Pipe.model_validate(
        {
            "id": "p",
            "fluid": "dhw",
            "from": {"kind": "cell", "cell": {"x": 0, "y": 0}},
            "to": {"kind": "cell", "cell": {"x": 4, "y": 0}},
            "flow": {
                "kind": "attribute",
                "target": {"devices": {"ids": ["d"]}, "attribute": "pump_running"},
            },
        }
    )
    assert pipe.flow is not None
    assert pipe.flow.target.attribute == "pump_running"


def test_a_tag_still_takes_either_arm():
    """Only ``flow`` is narrowed: a tag or a label may show a literal."""
    tag = Tag.model_validate(
        {
            "id": "t",
            "at": {"x": 0, "y": 0},
            "label": "TT",
            "value": {"kind": "text", "text": "55 °C"},
        }
    )
    assert isinstance(tag.value, TextSlot)


def test_fluid_is_a_closed_vocabulary():
    with pytest.raises(ValidationError):
        Pipe.model_validate(
            {
                "id": "p",
                "fluid": "steam",
                "from": {"kind": "cell", "cell": {"x": 0, "y": 0}},
                "to": {"kind": "cell", "cell": {"x": 1, "y": 0}},
            }
        )


def test_a_cell_defaults_to_ground_level():
    assert Cell(x=1, y=2).z == 0


@pytest.mark.parametrize("value", [10_001, -10_001, 10**9])
def test_a_cell_coordinate_is_bounded(value):
    """A run is expanded cell by cell, so an unbounded span turns a few hundred
    bytes of document into hours of CPU and an OOM."""
    with pytest.raises(ValidationError):
        Cell(x=value, y=0)


@pytest.mark.parametrize("value", [float("inf"), float("-inf"), float("nan")])
def test_a_label_position_must_be_finite(value):
    """inf and nan are not JSON, and the database refuses them: a plate holding
    one would validate, store in memory, and fail on the real backend."""
    with pytest.raises(ValidationError):
        Point(x=value, y=0)


def test_a_pipe_takes_only_the_authored_spelling_of_from():
    """``from_`` is a python detail forced by the reserved word, not a second
    key the format accepts."""
    with pytest.raises(ValidationError):
        Pipe.model_validate(
            {
                "id": "p",
                "fluid": "dhw",
                "from_": {"kind": "cell", "cell": {"x": 0, "y": 0}},
                "to": {"kind": "cell", "cell": {"x": 4, "y": 0}},
            }
        )


def test_a_cell_is_frozen():
    """Cells are compared and used as set members by the polyline rules."""
    with pytest.raises(ValidationError):
        Cell(x=1, y=2).x = 3
