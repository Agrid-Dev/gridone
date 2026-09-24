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
"""The format appendix's eight types."""

HYDRONIC_TYPES = {
    "plate_exchanger",
    "expansion_vessel",
    "air_separator",
    "dirt_separator",
    "pump_double",
    "energy_meter",
    "loop_heater",
    "valve_control",
}
"""The six the visual-language spec adds for the hydronic set, the loop
heater the panoplie P&IDs put on the bouclage return, and the motorised
two-way valve on the hot-production primary."""


def test_the_default_registry_ships_the_types_the_first_plates_use(registry):
    assert set(registry.types()) == SPEC_TYPES | HYDRONIC_TYPES


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


@pytest.mark.parametrize(
    "type_",
    [
        "pump",
        "valve_isolation",
        "valve_check",
        "valve_control",
        "air_separator",
        "dirt_separator",
        "pump_double",
        "energy_meter",
    ],
)
def test_inline_types_are_flagged_inline(registry, type_):
    assert registry.get(type_).inline is True
    assert registry.get(type_).ports == {}


@pytest.mark.parametrize(
    "type_",
    ["heat_pump", "tank", "collector", "link", "plate_exchanger", "expansion_vessel"],
)
def test_free_standing_types_are_not_inline(registry, type_):
    assert registry.get(type_).inline is False


def test_a_loop_heater_is_inline_with_a_state_and_a_fault(registry):
    """An electric loop heater sits in the bouclage return and reports marche
    and défaut, the two dry contacts its controller exposes."""
    heater = registry.get("loop_heater")
    assert heater.inline is True
    assert heater.slots == ("state", "fault")
    assert heater.ports == {}


@pytest.mark.parametrize(
    ("type_", "slots"),
    [
        ("pump", ("state", "speed")),
        ("pump_double", ("state",)),
        ("energy_meter", ("energy",)),
        ("dirt_separator", ("fault",)),
        ("valve_control", ("position",)),
        ("air_separator", ()),
    ],
)
def test_each_hydronic_type_declares_the_slots_its_plates_show(registry, type_, slots):
    """A slot is declared once a plate shows it; a binding to an undeclared
    slot stays an authoring error."""
    assert registry.get(type_).slots == slots


def test_a_plate_exchanger_has_a_port_on_each_face(registry):
    ports = registry.get("plate_exchanger").ports
    assert {name: port.side for name, port in ports.items()} == {
        "primary_in": "-x",
        "primary_out": "+x",
        "secondary_in": "-y",
        "secondary_out": "+y",
    }
    assert {port.offset for port in ports.values()} == {Cell(x=0, y=0)}


def test_an_expansion_vessel_has_one_inlet(registry):
    assert registry.get("expansion_vessel").ports == {
        "in": Port(offset=Cell(x=0, y=0), side="-x")
    }


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
    assert set(schemas) == SPEC_TYPES | HYDRONIC_TYPES

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


def test_schemas_publish_the_passages_a_fluid_takes_through_a_symbol(registry):
    """A renderer walks them to tell which runs circulate with a flowing one:
    the heat pump's return reaches its supply, the tank keeps its primary and
    its domestic side apart, a collector joins every port it authors, and an
    expansion vessel's single port leads nowhere."""
    schemas = registry.schemas()
    assert schemas["heat_pump"]["x-passages"] == [["return", "supply"]]
    assert schemas["tank"]["x-passages"] == [
        ["primary_in", "primary_out"],
        ["dhw_in", "dhw_out"],
    ]
    assert schemas["collector"]["x-passages"] == "all"
    assert schemas["expansion_vessel"]["x-passages"] == []
    assert schemas["pump"]["x-passages"] == []


def test_every_declared_passage_names_ports_of_its_own_type(registry):
    """The default registry passes its own check: every passage it publishes
    names ports the type has, and no port sits in two passages."""
    for name, schema in registry.schemas().items():
        passages = schema["x-passages"]
        if passages == "all":
            assert schema["x-ports-authored"], name
            continue
        ports = [port for passage in passages for port in passage]
        assert set(ports) <= set(schema["x-ports"]), name
        assert len(ports) == len(set(ports)), name


TWO_PORTS = {
    "in": Port(offset=Cell(x=0, y=0), side="-x"),
    "out": Port(offset=Cell(x=0, y=0), side="+x"),
}


@pytest.mark.parametrize(
    ("passages", "match"),
    [
        ((("in",),), "fewer than two ports"),
        ((("in", "outlet"),), "ports it lacks: outlet"),
        ((("in", "out"), ("out", "in")), "two passages: in, out"),
    ],
)
def test_a_passage_the_type_cannot_carry_is_refused(passages, match):
    """Caught at registration, not by the first plate a renderer walks."""
    registry = SymbolRegistry()
    with pytest.raises(InvalidError, match=match):
        registry.register(
            SymbolType(
                type="exchanger",
                footprint=Footprint(w=1, d=1),
                ports=TWO_PORTS,
                passages=passages,
            )
        )


def test_a_type_that_authors_its_ports_passes_through_all_or_none():
    """Its ports are named per instance, so the type cannot list them."""
    registry = SymbolRegistry()
    with pytest.raises(InvalidError, match="its passages are 'all'"):
        registry.register(
            SymbolType(
                type="manifold",
                footprint=None,
                props_model=CollectorProps,
                ports_from_props=lambda _props: TWO_PORTS,
                passages=(("in", "out"),),
            )
        )


def test_only_what_stops_the_fluid_when_off_gates_the_flow(registry):
    """A stopped pump or heat pump and a closed valve stop their circuit; a
    loop heater that is off only stops heating, and the loop still runs."""
    gating = {name for name, s in registry.schemas().items() if s["x-gates-flow"]}
    assert gating == {"heat_pump", "pump", "pump_double", "valve_isolation"}
    assert all("state" in registry.schemas()[name]["x-slots"] for name in gating), (
        "a type gates the flow by its state reading"
    )


def test_a_type_that_gates_the_flow_without_a_state_is_refused():
    """The gate is the state reading: with no slot to read, it never closes."""
    registry = SymbolRegistry()
    with pytest.raises(InvalidError, match="gates the flow with no state"):
        registry.register(
            SymbolType(
                type="valve",
                footprint=Footprint(w=1, d=1),
                inline=True,
                gates_flow=True,
            )
        )
