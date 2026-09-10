"""The registry: what a type is, and what it publishes."""

import pytest

from models.errors import InvalidError, NotFoundError
from synoptics.models import Cell, CellPlacement, Symbol
from synoptics.symbols import (
    CollectorProps,
    Footprint,
    Port,
    SymbolRegistry,
    SymbolType,
    TankProps,
    build_default_registry,
)

SPEC_TYPES = {
    "heat_pump",
    "tank",
    "collector",
    "mixing_valve",
    "pump",
    "valve_isolation",
    "valve_check",
    "link",
}


@pytest.fixture
def registry():
    return build_default_registry()


def test_the_default_registry_ships_the_types_the_first_plates_use(registry):
    assert set(registry.types()) == SPEC_TYPES


def test_registering_a_type_twice_is_rejected(registry):
    with pytest.raises(InvalidError, match="already registered"):
        registry.register(SymbolType(type="tank", footprint=Footprint(w=1, d=2)))


def test_getting_an_unregistered_type_is_a_not_found(registry):
    with pytest.raises(NotFoundError, match="Unknown symbol type"):
        registry.get("reactor")


def test_props_validate_against_the_type(registry):
    props = registry.validate_props("tank", {"capacity": "500 L"})
    assert isinstance(props, TankProps)
    assert props.capacity == "500 L"


def test_an_unknown_key_in_props_is_rejected(registry):
    """``extra="forbid"`` so a typo in an authored plate is a save-time error
    rather than a silently ignored key."""
    with pytest.raises(InvalidError, match="Invalid props"):
        registry.validate_props("tank", {"capacity": "500 L", "colour": "blue"})


def test_validating_props_for_an_unknown_type_is_an_authoring_error(registry):
    """An unknown type here is a bad document, not a missing resource."""
    with pytest.raises(InvalidError, match="Unknown symbol type"):
        registry.validate_props("reactor", {})


@pytest.mark.parametrize("type_", ["pump", "valve_isolation", "valve_check"])
def test_inline_types_are_flagged_inline(registry, type_):
    assert registry.get(type_).inline is True


@pytest.mark.parametrize("type_", ["heat_pump", "tank", "collector", "link"])
def test_free_standing_types_are_not_inline(registry, type_):
    assert registry.get(type_).inline is False


def test_a_types_own_ports_are_used_for_an_ordinary_symbol(registry):
    symbol = Symbol(
        id="pac-01",
        type="heat_pump",
        placement=CellPlacement(cell=Cell(x=0, y=0)),
    )
    ports = registry.ports_of(symbol)
    assert ports["supply"] == Port(offset=Cell(x=1, y=1), side="+x")


def test_a_collector_authors_its_own_ports(registry):
    """A bar serving three departures is not the same shape as one serving
    eight, so the offsets come from the instance."""
    symbol = Symbol(
        id="coll-01",
        type="collector",
        placement=CellPlacement(cell=Cell(x=5, y=-2)),
        props={
            "axis": "y",
            "length": 9,
            "ports": {"in_1": {"offset": 3, "side": "-x"}},
        },
    )
    assert registry.ports_of(symbol) == {"in_1": Port(offset=Cell(x=0, y=3), side="-x")}


def test_a_collector_on_the_x_axis_offsets_along_x(registry):
    symbol = Symbol(
        id="coll-01",
        type="collector",
        placement=CellPlacement(cell=Cell(x=0, y=0)),
        props={
            "axis": "x",
            "length": 4,
            "ports": {"out_1": {"offset": 2, "side": "+y"}},
        },
    )
    assert registry.ports_of(symbol)["out_1"].offset == Cell(x=2, y=0)


def test_a_collector_needs_at_least_two_cells(registry):
    with pytest.raises(InvalidError):
        registry.validate_props("collector", {"axis": "y", "length": 1, "ports": {}})


def test_a_links_target_is_optional(registry):
    """A link with no ``synoptic_id`` is an inert labelled boundary."""
    props = registry.validate_props("link", {"caption": "104 chambres"})
    assert props.synoptic_id is None


def test_schemas_carry_the_whole_type_contract(registry):
    """Footprint, ports, slots and inline capability ship with the props
    schema so the kit and the editor read one definition."""
    schemas = registry.schemas()
    assert set(schemas) == SPEC_TYPES

    heat_pump = schemas["heat_pump"]
    assert heat_pump["x-footprint"] == {"w": 2, "d": 2}
    assert heat_pump["x-inline"] is False
    assert set(heat_pump["x-slots"]) == {"state", "fault", "supply_temp", "power"}
    assert heat_pump["x-ports"]["supply"] == {
        "offset": {"x": 1, "y": 1, "z": 0},
        "side": "+x",
    }
    assert heat_pump["x-required-slots"] == []


def test_a_collector_publishes_no_footprint_or_ports(registry):
    """Its length and its ports come from props, so the type has neither."""
    collector = registry.schemas()["collector"]
    assert collector["x-footprint"] is None
    assert collector["x-ports"] == {}
    assert "axis" in collector["properties"]


def test_a_registered_type_is_all_it_takes_to_add_one():
    """Adding a type is a registration, not a branch on ``type`` somewhere."""
    registry = SymbolRegistry()
    registry.register(
        SymbolType(
            type="energy_meter",
            footprint=Footprint(w=1, d=1),
            slots=("energy",),
            inline=True,
        )
    )
    assert registry.types() == ["energy_meter"]
    assert registry.schemas()["energy_meter"]["x-inline"] is True


def test_ports_of_cannot_corrupt_the_registry(registry):
    """One registry is built per service and shared by every request, so a
    caller writing into what it was handed would change port resolution for
    every later document in the process."""
    symbol = Symbol(
        id="pac-01", type="heat_pump", placement=CellPlacement(cell=Cell(x=0, y=0))
    )
    ports = registry.ports_of(symbol)
    with pytest.raises(TypeError):
        ports["supply"] = None


def test_props_are_not_silently_coerced(registry):
    """Props are stored verbatim and read back by consumers holding no
    registry, so a string that validates as an int would leave validation and
    storage disagreeing about what was saved."""
    with pytest.raises(InvalidError):
        registry.validate_props(
            "collector",
            {"axis": "x", "length": "9", "ports": {}},
        )


@pytest.mark.parametrize(
    "props",
    [
        {"axis": "x", "length": 50000, "ports": {}},
        {
            "axis": "x",
            "length": 50000,
            "ports": {"out_1": {"offset": 20000, "side": "+y"}},
        },
    ],
)
def test_a_collector_cannot_be_longer_than_the_grid(registry, props):
    """Otherwise the props validate and the port cell they imply does not,
    and the crash escapes the save-time pass as a raw exception."""
    with pytest.raises(InvalidError):
        registry.validate_props("collector", props)


def test_a_collector_port_must_sit_on_its_bar(registry):
    with pytest.raises(InvalidError):
        registry.validate_props(
            "collector",
            {
                "axis": "x",
                "length": 3,
                "ports": {"out_1": {"offset": 99, "side": "+y"}},
            },
        )


@pytest.mark.parametrize("name", ["inlet", "in_", "in_0", "", "IN_1"])
def test_a_collector_port_is_named_by_the_type(registry, name):
    """The type owns the ``in_<n>`` / ``out_<n>`` naming; the instance authors
    only where the ports sit."""
    with pytest.raises(InvalidError):
        registry.validate_props(
            "collector",
            {"axis": "x", "length": 3, "ports": {name: {"offset": 1, "side": "+y"}}},
        )


def test_a_required_slot_the_type_does_not_declare_is_refused():
    """Otherwise no document can ever place the type: binding the slot is an
    unknown slot, omitting it is a missing one."""
    registry = SymbolRegistry()
    with pytest.raises(InvalidError, match="requires slots it does not declare"):
        registry.register(
            SymbolType(
                type="meter",
                footprint=Footprint(w=1, d=1),
                slots=("energy",),
                required_slots=frozenset({"enegry"}),
            )
        )


def test_collector_props_round_trip(registry):
    props = registry.validate_props(
        "collector",
        {"axis": "y", "length": 9, "ports": {"in_1": {"offset": 3, "side": "-x"}}},
    )
    assert isinstance(props, CollectorProps)
    assert props.ports["in_1"].side == "-x"
