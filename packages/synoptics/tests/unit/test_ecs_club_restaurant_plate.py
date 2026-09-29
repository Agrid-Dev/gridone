"""What the restaurant hot-water drawing decides on its own: an exchanger fed
by the hot production instead of heat pumps, four tanks in parallel on two
manifolds, and the same distribution corner as the bays.

``docs/specs/synoptic/ecs-club-restaurant.json`` is drawn from the plant's
production sheet and its panoplie, since the old GTB has no view of this
station. Every reading on it is a marker: the station's own probes are dead
at source and the controllers that read the rest are not yet tied to this
plant. The probes every committed plate shares are in ``test_plates.py``.
"""

import pytest
from plates import NOT_IDENTIFIED, NOT_MEASURED, read

from synoptics.models import PipeEndpoint, PortEndpoint, SynopticDocument
from synoptics.validation import bound_slots

TANKS = ("b01", "b02", "b03", "b04")


@pytest.fixture
def plate() -> SynopticDocument:
    return SynopticDocument.model_validate(read("ecs-club-restaurant"))


def test_the_plate_binds_nothing_yet(plate):
    """The WAGO words for this station read 0 since creation, the gateway that
    reads the exchanger is not confirmed as this plant's, and the pump couple is
    not identified: no slot, tag or run names a device."""
    assert bound_slots(plate) == []
    assert all(s.device_id is None for s in plate.symbols)
    assert all(p.flow is None for p in plate.pipes)


def test_the_production_is_an_exchanger_not_heat_pumps(plate, symbols):
    """The sheet draws one plate exchanger heated by the hot production; no
    heat pump, no loop heater and no surpression pump exist on this station
    (the restaurant panoplie's nomenclature stops before item 16)."""
    types = {s.type for s in plate.symbols}
    assert "plate_exchanger" in types
    assert types.isdisjoint({"heat_pump", "loop_heater", "pump_double"})
    assert [s.id for s in plate.symbols if s.type == "pump"] == [
        "pompe-charge",
        "pompe-bouclage",
    ]
    assert symbols["echangeur"].label == "ÉCHANGEUR ECS"


def test_every_tank_is_unnamed_fed_once_and_drained_once(plate, pipes):
    """Four 1000 L ballons in one row, each fed at its top from the top
    manifold and drained at its bottom into the bottom manifold, in parallel:
    the sheet draws a valve on every tank's inlet and outlet, so unlike the
    bays no tank is chained through another."""
    tanks = [s for s in plate.symbols if s.type == "tank"]
    assert [t.id for t in tanks] == list(TANKS)
    assert {t.props["capacity"] for t in tanks} == {"1000 L"}
    assert all(t.label is None for t in tanks)
    assert {t.placement.cell.y for t in tanks} == {0}
    for n, tank in enumerate(TANKS, start=1):
        feed, drain = pipes[f"feed-{tank}"], pipes[f"drain-{tank}"]
        assert feed.from_ == PortEndpoint(symbol="collector-charge", port=f"out_{n}")
        assert feed.to == PortEndpoint(symbol=tank, port="primary_in")
        assert drain.from_ == PortEndpoint(symbol=tank, port="primary_out")
        assert drain.to == PortEndpoint(symbol="collector-return", port=f"in_{n}")
    chained = [
        p.id
        for p in plate.pipes
        if isinstance(p.to, PortEndpoint)
        and p.to.symbol in TANKS
        and isinstance(p.from_, PortEndpoint)
        and p.from_.symbol in TANKS
    ]
    assert chained == []


def test_the_charge_loop_runs_manifold_pump_exchanger_manifold(symbols, pipes, tags):
    """Bottom manifold to the exchanger's secondary through the drawn pump and
    a check valve, secondary back to the top manifold. The pump is one plain
    symbol as the bays' bouclage pump is, its state marked: the gateway drives
    a double primary pump and a simple charge pump and nothing says which is
    drawn. The two thermometers the sheet draws at the exchanger's secondary
    inlet and outlet carry the same marker: the gateway reads probes it says
    sit there, but its attachment to this plant is not a site fact yet."""
    charge, back = pipes["charge"], pipes["secondaire-sortie"]
    assert charge.from_ == PortEndpoint(symbol="collector-return", port="out_1")
    assert charge.to == PortEndpoint(symbol="echangeur", port="secondary_in")
    assert back.from_ == PortEndpoint(symbol="echangeur", port="secondary_out")
    assert back.to == PortEndpoint(symbol="collector-charge", port="in_1")
    pump, clapet = symbols["pompe-charge"], symbols["clapet-charge"]
    assert (pump.type, pump.placement.pipe, pump.label) == ("pump", "charge", None)
    assert pump.bindings == {"state": NOT_IDENTIFIED}
    assert (clapet.type, clapet.placement.pipe) == ("valve_check", "charge")
    # Eastwards along the manifold's row: the pump, then the check valve, then
    # the inlet thermometer, all on the run's stretch at y = 4.
    entree = next(t for t in charge.tags if t.id == "tt-secondaire-entree")
    assert pump.placement.cell.x < clapet.placement.cell.x < entree.at.x
    assert {pump.placement.cell.y, clapet.placement.cell.y, entree.at.y} == {4}
    assert tags["tt-secondaire-entree"] == ("charge", NOT_IDENTIFIED)
    assert tags["tt-secondaire-sortie"] == ("secondaire-sortie", NOT_IDENTIFIED)


def test_the_primary_is_the_hot_production_s_cuisine_circuit(symbols, pipes):
    """One link to the hot production, whose plate draws this pipe as its
    "CIRCUIT ECS (CUISINE)"; the sheet's energy valve, energy meter and check
    valve on the supply, in that order from the link; the motorised three-way
    valve on the return with its bypass from the supply, drawn as a tee one
    cell from the valve (a deliberate simplification, written in the spec).
    The meter and the energy valve have no device; the three-way valve is read
    by the gateway, so it is marked "non identifiée", not "non mesurée"."""
    link = symbols["link-production-chaud"]
    assert (link.type, link.label, link.props["synoptic_id"]) == (
        "link",
        "PRODUCTION CHAUD",
        None,
    )
    supply, ret = pipes["primaire-depart"], pipes["primaire-retour"]
    assert supply.from_ == PortEndpoint(symbol="link-production-chaud", port="out")
    assert supply.to == PortEndpoint(symbol="echangeur", port="primary_in")
    assert ret.from_ == PortEndpoint(symbol="echangeur", port="primary_out")
    assert ret.to == PortEndpoint(symbol="link-production-chaud", port="in")
    inline = {s.id: s for s in symbols.values() if s.placement.kind == "pipe"}
    on_supply = sorted(
        (s for s in inline.values() if s.placement.pipe == "primaire-depart"),
        key=lambda s: -s.placement.cell.x,  # the supply flows west from the link
    )
    assert [s.type for s in on_supply] == [
        "valve_control",
        "energy_meter",
        "valve_check",
    ]
    assert symbols["v-regulation"].bindings == {"position": NOT_MEASURED}
    assert symbols["cpt-primaire"].bindings == {"energy": NOT_MEASURED}
    v3v = symbols["v3v-primaire"]
    assert (v3v.type, v3v.placement.pipe) == ("valve_control", "primaire-retour")
    assert v3v.bindings == {"position": NOT_IDENTIFIED}
    bypass = pipes["bypass-v3v"]
    assert bypass.fluid == "heating_supply"
    assert isinstance(bypass.from_, PipeEndpoint)
    assert bypass.from_.pipe == "primaire-depart"
    assert isinstance(bypass.to, PipeEndpoint)
    assert bypass.to.pipe == "primaire-retour"
    assert abs(bypass.to.cell.x - v3v.placement.cell.x) == 1
    assert bypass.to.cell.y == v3v.placement.cell.y


def test_the_distribution_corner_is_the_panoplie_s(symbols, pipes, tags):
    """As on the bays: the départ off the top manifold through the mitigeur,
    whose cold inlet is fed by eau froide adoucie, into the distribution; the
    bouclage back through its pump into the bottom manifold, the RETOUR probe
    before the pump; and the eau froide adoucie the sheet brings to the bottom
    manifold. The two station readings ride as "non mesurée" (the WAGO words
    read 0), the pump as "non identifiée" (one of three couples)."""
    mitigeur = symbols["mitigeur"]
    assert (mitigeur.type, mitigeur.label, mitigeur.bindings) == (
        "mixing_valve",
        "MITIGEUR",
        {},
    )
    assert pipes["dhw-departure"].from_ == PortEndpoint(
        symbol="collector-charge", port="out_5"
    )
    assert pipes["dhw-departure"].to == PortEndpoint(symbol="mitigeur", port="hot_in")
    assert pipes["dhw-supply"].from_ == PortEndpoint(symbol="mitigeur", port="out")
    assert pipes["dhw-supply"].to == PortEndpoint(symbol="link-distribution", port="in")
    assert pipes["efa-mitigeur"].from_ == PortEndpoint(symbol="link-efa", port="out")
    assert pipes["efa-mitigeur"].to == PortEndpoint(symbol="mitigeur", port="cold_in")
    loop = pipes["dhw-loop-return"]
    assert loop.from_ == PortEndpoint(symbol="link-distribution", port="out")
    assert loop.to == PortEndpoint(symbol="collector-return", port="in_5")
    assert tags["tt-depart"] == ("dhw-supply", NOT_MEASURED)
    assert tags["tt-retour"] == ("dhw-loop-return", NOT_MEASURED)
    pump = symbols["pompe-bouclage"]
    assert (pump.type, pump.placement.pipe, pump.label) == (
        "pump",
        "dhw-loop-return",
        "POMPE DE BOUCLAGE",
    )
    assert pump.bindings == {"state": NOT_IDENTIFIED}
    # Both ride the run's eastward stretch under the bay: the probe first.
    retour = next(t for t in loop.tags if t.id == "tt-retour")
    assert retour.at.y == pump.placement.cell.y
    assert retour.at.x < pump.placement.cell.x
    assert pipes["efa-appoint"].from_ == PortEndpoint(
        symbol="link-efa-appoint", port="out"
    )
    assert pipes["efa-appoint"].to == PortEndpoint(
        symbol="collector-return", port="in_6"
    )


def test_the_fluids_are_keyed_by_circuit_role(pipes):
    """The hot production's water `heating_*`, the charge loop between the
    exchanger and the tanks `primary_*`, the départ `dhw`, the bouclage
    `dhw_loop`, eau froide adoucie `cold_water` at both entries."""
    fluid = {p.id: p.fluid for p in pipes.values()}
    assert fluid["primaire-depart"] == fluid["bypass-v3v"] == "heating_supply"
    assert fluid["primaire-retour"] == "heating_return"
    assert fluid["secondaire-sortie"] == fluid["feed-b01"] == "primary_supply"
    assert fluid["charge"] == fluid["drain-b01"] == "primary_return"
    assert fluid["dhw-departure"] == fluid["dhw-supply"] == "dhw"
    assert fluid["dhw-loop-return"] == "dhw_loop"
    assert fluid["efa-mitigeur"] == fluid["efa-appoint"] == "cold_water"


def test_the_labels_are_the_drawing_s_words(plate, symbols):
    """Named symbols carry the sheets' own words and nothing else: the tanks,
    the manifolds, the valves and the meter are unnamed on both sheets. The
    bay caption carries the sheet's count and capacity and no total, and no
    label reads a value: this station has no electricity meter of its own."""
    named = {s.label for s in plate.symbols if s.label}
    assert named == {
        "ÉCHANGEUR ECS",
        "PRODUCTION CHAUD",
        "MITIGEUR",
        "EAU FROIDE ADOUCIE",
        "DISTRIBUTION ECS",
        "POMPE DE BOUCLAGE",
    }
    labels = {label.id: label for label in plate.labels}
    assert labels["title"].text == "PRODUCTION ECS CLUB / RESTAURANT"
    assert labels["zone-storage"].text == "STOCKAGE · 4 × 1000 L"  # noqa: RUF001
    assert all(label.value is None for label in plate.labels)
    assert symbols["link-efa-appoint"].label == symbols["link-efa"].label
