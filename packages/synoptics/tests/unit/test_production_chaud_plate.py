"""What the hot-production drawing decides on its own: a district primary
on a plate exchanger, four pump heads on a manifold, two collectors serving
four circuits, two of them able to change over to the cold production.

``docs/specs/synoptic/production-chaud.json`` is the first plate off the
hot-water template. The probes every committed plate shares are in
``test_plates.py``.
"""

from collections import Counter

import pytest
from plates import (
    device_of,
    joins,
    read,
    shares_no_device_with_the_bays,
)

from synoptics.models import (
    AttributeSlot,
    PortEndpoint,
    SynopticDocument,
    TextSlot,
)

PUMP_HEADS = ("e2a", "e2b", "e3a", "e3b")
CIRCUITS = ("cuisine", "vc", "cta", "vcv-chambres")
CONTROLLER = "71c980107f9448e7"
CIRCUIT_VALVE = {
    "cuisine": "1c1724ce0ba54ef0",
    "vc": "c38fbfc58e1d40e7",
    "cta": "f38f762306b94da2",
    "vcv-chambres": "710facd4aa5946ca",
}
"""Each circuit's energy valve: its meter, its control valve and two probes."""
CHANGE_OVER_DEVICE = "5ab638091bd2483d"
CHANGE_OVER = {"vc": "vc", "vcv-chambres": "vcv"}
"""A change-over circuit, and the prefix its readings carry on the controller."""


@pytest.fixture
def plate() -> SynopticDocument:
    return SynopticDocument.model_validate(read("production-chaud"))


def test_the_plate_binds_none_of_the_bay_devices(plate):
    assert shares_no_device_with_the_bays(plate)


def test_the_primary_is_the_district_side_of_the_exchanger(symbols, pipes):
    """Return temperature, regulation valve, heat meter, in the flow's order
    on the primary return; the supply crosses the secondary overhead."""
    assert pipes["prim-supply"].from_ == PortEndpoint(
        symbol="link-batiment-d", port="out"
    )
    assert pipes["prim-supply"].to == PortEndpoint(symbol="ech-ec04", port="primary_in")
    assert pipes["prim-return"].from_ == PortEndpoint(
        symbol="ech-ec04", port="primary_out"
    )
    assert pipes["prim-return"].to == PortEndpoint(symbol="link-batiment-d", port="in")
    assert any(w.z == 1 for w in pipes["prim-supply"].waypoints)
    on_return = {
        s.id: s.placement.cell.x
        for s in symbols.values()
        if s.placement.kind == "pipe" and s.placement.pipe == "prim-return"
    }
    tag = pipes["prim-return"].tags[0]
    # Flow runs west, from the exchanger at x = 10 to the link at x = 0.
    assert tag.at.x > on_return["v-primaire"] > on_return["cpt-ec-ech-04"]
    assert symbols["cpt-ec-ech-04"].type == "energy_meter"
    assert symbols["v-primaire"].type == "valve_control"
    position = symbols["v-primaire"].bindings["position"]
    assert (device_of(position), position.target.attribute) == (
        CONTROLLER,
        "ec04_sigv3v",
    )
    assert (position.unit, position.decimals) == ("%", 0)
    energy = symbols["cpt-ec-ech-04"].bindings["energy"]
    assert isinstance(energy, AttributeSlot)
    assert energy.target.attribute == "energie"
    assert (energy.unit, energy.decimals) == ("kWh", 0)
    assert symbols["cpt-ec-ech-04"].device_id == device_of(energy)


def test_the_three_temperatures_read_the_meter_and_the_controller(tags):
    """Two probes of the heat meter and one of the controller, never one
    reading twice."""
    _, depart = tags["tt-primaire-depart"]
    _, retour = tags["tt-primaire-retour"]
    _, secondaire = tags["tt-secondaire-depart"]
    assert device_of(depart) == device_of(retour) != device_of(secondaire)
    assert (depart.target.attribute, retour.target.attribute) == (
        "tmpdepart",
        "tmpretour",
    )
    assert secondaire.target.attribute == "echec_tmpdepart"
    for reading in (depart, retour, secondaire):
        assert (reading.unit, reading.decimals) == ("°C", 1)


def test_the_manifold_gives_every_head_its_own_branch(symbols, pipes):
    """Four heads, four branches, four devices; the trunk and the merge carry
    no flow (four heads feed one run, no single attribute says it runs)."""
    heads = {h: symbols[f"pompe-pec-{h}"] for h in PUMP_HEADS}
    assert {h.type for h in heads.values()} == {"pump"}
    devices = {h.device_id for h in heads.values()}
    assert len(devices) == 4
    for name, head in heads.items():
        branch = pipes[f"pec-{name}-branch"]
        assert head.placement.kind == "pipe"
        assert head.placement.pipe == branch.id
        assert set(head.bindings) == {"state", "speed"}
        assert {device_of(v) for v in head.bindings.values()} == {head.device_id}
        assert head.bindings["speed"].unit == "tr/min"
        assert device_of(branch.flow) == head.device_id
        # The view's pressure dials are the heads' own differential head
        # registers (the cold view's 65.5 bar is a stopped head's sentinel),
        # so each branch carries its head's reading, raw.
        pression = next(t for t in branch.tags if t.id == f"pression-pec-{name}")
        assert device_of(pression.value) == head.device_id
        assert (pression.value.target.attribute, pression.value.unit) == (
            "head",
            "bar",
        )
        assert branch.flow.target.attribute == "onoff_state"
        assert joins(branch.to, "sec-supply-out")
    assert pipes["sec-supply"].flow is None
    assert pipes["sec-supply-out"].flow is None
    # E2 above E3 and A above B, as the view stacks them: rows ascend in y.
    rows = [heads[h].placement.cell.y for h in PUMP_HEADS]
    assert rows == sorted(rows)
    # The trunk ends where the top branch starts; the other three tee off it.
    assert joins(pipes["sec-supply"].to, "pec-e2a-branch")
    assert pipes["sec-supply"].to.cell == pipes["pec-e2a-branch"].from_.cell
    for name in PUMP_HEADS[1:]:
        assert joins(pipes[f"pec-{name}-branch"].from_, "sec-supply")


def test_every_circuit_reads_its_own_energy_valve(plate, symbols, tags):
    """A circuit's meter, control valve and return temperature are one device,
    on its return, the meter first in the flow; its departure is that device's
    other probe, or the common leg's on a change-over circuit. No reading on
    the plate is a placeholder."""
    assert list(CIRCUIT_VALVE) == list(CIRCUITS)
    assert len(set(CIRCUIT_VALVE.values())) == len(CIRCUITS)
    for k, device in CIRCUIT_VALVE.items():
        meter, valve = symbols[f"cpt-{k}"], symbols[f"v-{k}"]
        assert (meter.type, meter.placement.pipe) == ("energy_meter", f"{k}-retour")
        assert (valve.type, valve.placement.pipe) == ("valve_control", f"{k}-retour")
        # The return runs south to its collector: y grows with the flow.
        assert valve.placement.cell.y > meter.placement.cell.y
        energy, position = meter.bindings["energy"], valve.bindings["position"]
        assert meter.device_id == device_of(energy) == device_of(position) == device
        assert (energy.target.attribute, energy.unit, energy.decimals) == (
            "energyheating1",
            "kWh",
            0,
        )
        assert (position.target.attribute, position.unit, position.decimals) == (
            "relposition",
            "%",
            0,
        )
        pipe, retour = tags[f"tt-{k}-retour"]
        assert (pipe, device_of(retour), retour.target.attribute) == (
            f"{k}-retour",
            device,
            "temp2c",
        )
        pipe, depart = tags[f"tt-{k}-depart"]
        assert pipe == f"{k}-depart"
        prefix = CHANGE_OVER.get(k)
        assert (device_of(depart), depart.target.attribute) == (
            (CHANGE_OVER_DEVICE, f"{prefix}_tmpdepart")
            if prefix
            else (device, "temp1c")
        )
        for reading in (depart, retour):
            assert (reading.unit, reading.decimals) == ("°C", 1)
    values = [v for s in plate.symbols for v in s.bindings.values()]
    values += [t.value for p in plate.pipes for t in p.tags]
    assert not any(isinstance(v, TextSlot) for v in values)


def test_the_change_over_blocks_are_the_view_s(symbols, pipes):
    """Four valve states per change-over circuit (hot supply, hot return,
    one per cold leg), a link per cold leg, and the circuit's meter and
    return temperature on the hot-only leg, past the tee and its valve. The
    controller has one open end switch per side: the two hot valves read it
    together, and so do the two cold ones."""
    for k, prefix in CHANGE_OVER.items():
        valves = [
            s
            for s in symbols.values()
            if s.type == "valve_isolation" and s.id.startswith(f"v-{k}-")
        ]
        assert len(valves) == 4
        for valve in valves:
            side = "ec" if "-ec-" in valve.id else "eg"
            state = valve.bindings["state"]
            assert (device_of(state), state.target.attribute) == (
                CHANGE_OVER_DEVICE,
                f"{prefix}{side}_choverfdcouv",
            )
            assert state.labels == {"true": "OUVERTE", "false": "FERMÉE"}
        on = Counter(v.placement.pipe for v in valves)
        assert on == {
            f"{k}-depart": 1,
            f"{k}-retour": 1,
            f"eg-{k}-aller": 1,
            f"eg-{k}-retour": 1,
        }
        aller, retour = pipes[f"eg-{k}-aller"], pipes[f"eg-{k}-retour"]
        assert (aller.fluid, retour.fluid) == ("chilled_supply", "chilled_return")
        assert aller.from_ == PortEndpoint(symbol=f"link-eg-{k}-aller", port="out")
        assert joins(aller.to, f"{k}-depart")
        assert joins(retour.from_, f"{k}-retour")
        assert retour.to == PortEndpoint(symbol=f"link-eg-{k}-retour", port="in")
        for end in ("aller", "retour"):
            assert symbols[f"link-eg-{k}-{end}"].type == "link"
        # The departure runs north (y falls with the flow): the hot valve,
        # the tee, then the probe of what the circuit receives.
        hot = symbols[f"v-{k}-ec-aller"].placement.cell
        probe = next(t for t in pipes[f"{k}-depart"].tags if t.id == f"tt-{k}-depart")
        assert hot.y > aller.to.cell.y > probe.at.y
        # The return runs south: the tee, the hot valve, the meter, and the
        # return temperature before the collector.
        hot = symbols[f"v-{k}-ec-retour"].placement.cell
        probe = next(t for t in pipes[f"{k}-retour"].tags if t.id == f"tt-{k}-retour")
        meter = symbols[f"cpt-{k}"].placement.cell
        assert retour.from_.cell.y < hot.y < meter.y < probe.at.y
    for k in set(CIRCUITS) - set(CHANGE_OVER):
        assert f"eg-{k}-aller" not in pipes
        assert [s for s in symbols.values() if s.id.startswith(f"v-{k}")] == [
            symbols[f"v-{k}"]
        ]


def test_the_circuits_leave_the_supply_bar_and_return_over_it(symbols, pipes):
    """Four departures, four returns, and every return riser crosses the
    supply bar overhead: at grade it would read as a junction."""
    supply = symbols["collector-supply"].props["ports"]
    back = symbols["collector-return"].props["ports"]
    assert {n for n in supply if n.startswith("out_")} == {
        f"out_{i}" for i in range(1, 5)
    }
    assert {n for n in back if n.startswith("in_")} == {f"in_{i}" for i in range(1, 5)}
    bar_row = symbols["collector-supply"].placement.cell.y
    for n, k in enumerate(CIRCUITS, 1):
        depart, retour = pipes[f"{k}-depart"], pipes[f"{k}-retour"]
        assert depart.from_ == PortEndpoint(symbol="collector-supply", port=f"out_{n}")
        assert depart.to == PortEndpoint(symbol=f"link-{k}", port="in")
        assert retour.from_ == PortEndpoint(symbol=f"link-{k}", port="out")
        assert retour.to == PortEndpoint(symbol="collector-return", port=f"in_{n}")
        assert (depart.fluid, retour.fluid) == ("heating_supply", "heating_return")
        raised = [w for w in retour.waypoints if w.z == 1]
        assert raised
        assert min(w.y for w in raised) < bar_row < max(w.y for w in raised)
    assert symbols["collector-supply"].label is None
    assert symbols["collector-return"].label is None


def test_the_return_side_reads_the_controller_s_contacts(symbols, pipes):
    """The pot's and the low-water switch's physical inputs (not the alarm
    copies on the sub-station device), the pot on a side loop of the return,
    the vessel off the return, the make-up water joining at the vessel."""
    pot = symbols["pot-a-boue"]
    assert (pot.type, pot.placement.pipe) == ("dirt_separator", "pot-a-boue-loop")
    loop = pipes["pot-a-boue-loop"]
    assert joins(loop.from_, "sec-return")
    assert joins(loop.to, "sec-return")
    # Flow runs west: the loop leaves upstream of where it comes back, and
    # both drops sit between the collector and the vessel's tee.
    assert loop.from_.cell.x > loop.to.cell.x > pipes["vase-connection"].from_.cell.x
    assert pot.bindings["fault"].target.attribute == "ec04_defpotboue"
    manque = next(t for t in pipes["sec-return"].tags if t.id == "tt-manque-eau")
    # The switch sits between the vessel's tee and the pot's loop.
    assert pipes["vase-connection"].from_.cell.x < manque.at.x < loop.to.cell.x
    assert manque.value.target.attribute == "ec04_defmanqueeau"
    assert device_of(manque.value) == device_of(pot.bindings["fault"])
    assert manque.value.labels == {"true": "DÉFAUT", "false": "NORMAL"}
    assert joins(pipes["vase-connection"].from_, "sec-return")
    assert pipes["vase-connection"].to == PortEndpoint(symbol="vec-04", port="in")
    assert symbols["vec-04"].type == "expansion_vessel"
    assert pipes["eau-ville"].from_ == PortEndpoint(
        symbol="link-production-eg", port="out"
    )
    assert joins(pipes["eau-ville"].to, "vase-connection")
    assert pipes["eau-ville"].fluid == "cold_water"


def test_the_fluids_are_keyed_by_circuit_role(pipes):
    """A run keyed as a sanitary fluid would take the bays' palette."""
    fluid = {p.id: p.fluid for p in pipes.values()}
    assert fluid["prim-supply"] == "primary_supply"
    assert fluid["prim-return"] == "primary_return"
    assert {fluid[p] for p in ("sec-supply", "sec-supply-out")} == {"heating_supply"}
    assert {fluid[f"pec-{h}-branch"] for h in PUMP_HEADS} == {"heating_supply"}
    assert {fluid[p] for p in ("sec-return", "vase-connection", "pot-a-boue-loop")} == {
        "heating_return"
    }
    assert set(fluid.values()) == {
        "primary_supply",
        "primary_return",
        "heating_supply",
        "heating_return",
        "chilled_supply",
        "chilled_return",
        "cold_water",
    }


def test_the_labels_are_the_drawing_s_words(plate, symbols):
    """The view's own text or nothing; a label on a valve would also hide
    the control valve's M mark."""
    assert [(label.role, label.text) for label in plate.labels] == [
        ("title", "PRODUCTION CHAUD")
    ]
    assert symbols["ech-ec04"].label == "ECH EC04"
    assert symbols["vec-04"].label == "VASE D'EXPANSION VEC 04"
    assert symbols["separateur-air"].label == "SÉPARATEUR D'AIR"
    assert symbols["pot-a-boue"].label == "POT À BOUE"
    assert symbols["link-batiment-d"].label == "DEPUIS BÂTIMENT D"
    assert symbols["link-production-eg"].label == "DEPUIS PRODUCTION EG"
    assert symbols["link-vc"].label == "CIRCUIT CHANGE-OVER VC"
    assert symbols["cpt-cuisine"].label == "CPT-EC-ECS CUISINE"
    assert all(
        s.label is None
        for s in symbols.values()
        if s.type in ("valve_isolation", "valve_control")
    )
    assert [symbols[f"pompe-pec-{h}"].label for h in PUMP_HEADS] == [
        "PEC E2A",
        "PEC E2B",
        "PEC E3A",
        "PEC E3B",
    ]
