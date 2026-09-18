"""What the hot-production drawing decides on its own: a district primary
on a plate exchanger, four pump heads on a manifold, two collectors serving
four circuits, two of them able to change over to the cold production.

``docs/specs/synoptic/production-chaud.json`` is the first plate off the
hot-water template. The probes every committed plate shares are in
``test_plates.py``.
"""

from collections import Counter

import pytest
from plates import ECS_PLATES, bound_device_ids, read

from synoptics.models import (
    AttributeSlot,
    Endpoint,
    PipeEndpoint,
    PortEndpoint,
    SynopticDocument,
    TextSlot,
)

NOT_MEASURED = TextSlot(text="non mesurée")
NOT_IDENTIFIED = TextSlot(text="non identifiée")

PUMP_HEADS = ("d2-a", "d2-b", "d3-a", "d3-b")
CIRCUITS = ("cuisine", "vcv-rdc", "cta", "vcv-chambres")
CHANGE_OVER = ("vcv-rdc", "vcv-chambres")


@pytest.fixture
def plate() -> SynopticDocument:
    return SynopticDocument.model_validate(read("production-chaud"))


@pytest.fixture
def symbols(plate):
    return {s.id: s for s in plate.symbols}


@pytest.fixture
def pipes(plate):
    return {p.id: p for p in plate.pipes}


@pytest.fixture
def tags(plate):
    """Every tag by id, with the run it rides and its value."""
    return {t.id: (p.id, t.value) for p in plate.pipes for t in p.tags}


def _device(slot: AttributeSlot | TextSlot | None) -> str:
    assert isinstance(slot, AttributeSlot)
    return (slot.target.devices.ids or [""])[0]


def _joins(endpoint: Endpoint, pipe_id: str) -> bool:
    """Whether an endpoint tees onto the run *pipe_id*."""
    return isinstance(endpoint, PipeEndpoint) and endpoint.pipe == pipe_id


def test_the_plate_binds_none_of_the_bay_devices(plate):
    """A device id copied from a bay plate would read another plant and
    still validate."""
    for name in ECS_PLATES:
        bay = SynopticDocument.model_validate(read(name))
        assert bound_device_ids(plate).isdisjoint(bound_device_ids(bay))


def test_the_primary_is_the_district_side_of_the_exchanger(symbols, pipes):
    """Return temperature, heat meter, regulation valve, in the view's flow
    order on the primary return; the supply crosses the secondary overhead."""
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
    assert tag.at.x > on_return["cpt-ec-ech-04"] > on_return["v-primaire"]
    assert symbols["cpt-ec-ech-04"].type == "energy_meter"
    assert symbols["v-primaire"].type == "valve_control"
    assert symbols["v-primaire"].bindings == {"position": NOT_MEASURED}
    energy = symbols["cpt-ec-ech-04"].bindings["energy"]
    assert isinstance(energy, AttributeSlot)
    assert energy.target.attribute == "energie"
    assert (energy.unit, energy.decimals) == ("Wh", 0)
    assert symbols["cpt-ec-ech-04"].device_id == _device(energy)


def test_the_three_temperatures_read_the_meter_and_the_controller(tags):
    """Two probes of the heat meter and one of the controller, never one
    reading twice."""
    _, depart = tags["tt-primaire-depart"]
    _, retour = tags["tt-primaire-retour"]
    _, secondaire = tags["tt-secondaire-depart"]
    assert _device(depart) == _device(retour) != _device(secondaire)
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
        assert {_device(v) for v in head.bindings.values()} == {head.device_id}
        assert head.bindings["speed"].unit == "tr/min"
        assert _device(branch.flow) == head.device_id
        assert branch.flow.target.attribute == "onoff_state"
        assert _joins(branch.to, "sec-supply-out")
    assert pipes["sec-supply"].flow is None
    assert pipes["sec-supply-out"].flow is None
    # D2 above D3 and A above B, as the view stacks them: rows ascend in y.
    rows = [heads[h].placement.cell.y for h in PUMP_HEADS]
    assert rows == sorted(rows)
    # The trunk ends where the top branch starts; the other three tee off it.
    assert _joins(pipes["sec-supply"].to, "pec-d2-a-branch")
    assert pipes["sec-supply"].to.cell == pipes["pec-d2-a-branch"].from_.cell
    for name in PUMP_HEADS[1:]:
        assert _joins(pipes[f"pec-{name}-branch"].from_, "sec-supply")


def test_the_markers_sit_where_the_view_draws_the_sensor(symbols, tags):
    """Seventeen drawn readings have no device and say "non mesurée" where
    the view draws their sensor; the change-over circuits' say "non
    identifiée", read by a device but not yet told apart."""
    for side in ("aspiration", "refoulement"):
        for twin in ("d2", "d3"):
            pipe_id, value = tags[f"pression-{twin}-{side}"]
            assert value == NOT_MEASURED
            assert pipe_id == (
                "sec-supply" if side == "aspiration" else "sec-supply-out"
            )
    for k in CIRCUITS:
        expected = NOT_IDENTIFIED if k in CHANGE_OVER else NOT_MEASURED
        assert tags[f"tt-{k}-depart"] == (f"{k}-depart", expected)
        assert tags[f"tt-{k}-retour"] == (f"{k}-retour", NOT_MEASURED)
        meter = symbols[f"cpt-{k}"]
        assert (meter.type, meter.placement.pipe) == ("energy_meter", f"{k}-retour")
        assert meter.bindings == {"energy": NOT_MEASURED}
    # The change-over circuits' valves are the change-over test's.
    for k in set(CIRCUITS) - set(CHANGE_OVER):
        assert symbols[f"v-{k}"].bindings == {"state": NOT_MEASURED}
        assert symbols[f"v-{k}"].placement.pipe == f"{k}-depart"
    live = {i: v for i, (_, v) in tags.items() if isinstance(v, AttributeSlot)}
    assert set(live) == {
        "tt-primaire-depart",
        "tt-primaire-retour",
        "tt-secondaire-depart",
        "tt-manque-eau",
    }


def test_the_change_over_blocks_are_the_view_s(symbols, pipes):
    """Five valve states per change-over circuit (two on the hot supply
    riser, one on the hot return, one per cold leg) and a link per cold leg."""
    for k in CHANGE_OVER:
        valves = [
            s
            for s in symbols.values()
            if s.type == "valve_isolation" and s.id.startswith(f"v-{k}")
        ]
        assert len(valves) == 5
        assert all(v.bindings == {"state": NOT_IDENTIFIED} for v in valves)
        on = Counter(v.placement.pipe for v in valves)
        assert on == {
            f"{k}-depart": 2,
            f"{k}-retour": 1,
            f"eg-{k}-aller": 1,
            f"eg-{k}-retour": 1,
        }
        aller, retour = pipes[f"eg-{k}-aller"], pipes[f"eg-{k}-retour"]
        assert (aller.fluid, retour.fluid) == ("chilled_supply", "chilled_return")
        assert aller.from_ == PortEndpoint(symbol=f"link-eg-{k}-aller", port="out")
        assert _joins(aller.to, f"{k}-depart")
        assert _joins(retour.from_, f"{k}-retour")
        assert retour.to == PortEndpoint(symbol=f"link-eg-{k}-retour", port="in")
        for end in ("aller", "retour"):
            assert symbols[f"link-eg-{k}-{end}"].type == "link"
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
    copies on the sub-station device), the vessel off the return, the cold
    production's leg joining at the vessel."""
    pot = symbols["pot-a-boue"]
    assert (pot.type, pot.placement.pipe) == ("dirt_separator", "sec-return")
    assert pot.bindings["fault"].target.attribute == "ec04_defpotboue"
    manque = next(t for t in pipes["sec-return"].tags if t.id == "tt-manque-eau")
    assert manque.value.target.attribute == "ec04_defmanqueeau"
    assert _device(manque.value) == _device(pot.bindings["fault"])
    assert manque.value.labels == {"true": "DÉFAUT", "false": "NORMAL"}
    assert _joins(pipes["vase-connection"].from_, "sec-return")
    assert pipes["vase-connection"].to == PortEndpoint(symbol="vec-04", port="in")
    assert symbols["vec-04"].type == "expansion_vessel"
    assert pipes["eg-balance"].from_ == PortEndpoint(
        symbol="link-production-eg", port="out"
    )
    assert _joins(pipes["eg-balance"].to, "vase-connection")
    assert pipes["eg-balance"].fluid == "chilled_return"


def test_the_fluids_are_keyed_by_circuit_role(pipes):
    """A run keyed as a sanitary fluid would take the bays' palette."""
    fluid = {p.id: p.fluid for p in pipes.values()}
    assert fluid["prim-supply"] == "primary_supply"
    assert fluid["prim-return"] == "primary_return"
    assert {fluid[p] for p in ("sec-supply", "sec-supply-out")} == {"heating_supply"}
    assert {fluid[f"pec-{h}-branch"] for h in PUMP_HEADS} == {"heating_supply"}
    assert {fluid[p] for p in ("sec-return", "vase-connection")} == {"heating_return"}
    assert set(fluid.values()) == {
        "primary_supply",
        "primary_return",
        "heating_supply",
        "heating_return",
        "chilled_supply",
        "chilled_return",
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
    assert symbols["link-vcv-rdc"].label == "CIRCUIT CHANGE-OVER VCV RDC"
    assert symbols["cpt-cuisine"].label == "CPT-EC-ECS CUISINE"
    assert all(
        s.label is None
        for s in symbols.values()
        if s.type in ("valve_isolation", "valve_control")
    )
    assert [symbols[f"pompe-pec-{h}"].label for h in PUMP_HEADS] == [
        "PEC-D2 A",
        "PEC-D2 B",
        "PEC-D3 A",
        "PEC-D3 B",
    ]
