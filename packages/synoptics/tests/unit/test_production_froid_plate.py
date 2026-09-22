"""What the cold-production drawing decides on its own: the hot production's
template with one twin pump, three circuits and no crossover, plus the one
pipe between the two productions that the hot view draws and this one omits.

``docs/specs/synoptic/production-froid.json`` is the first plate authored in
the editor. The probes every committed plate shares are in ``test_plates.py``.
"""

import pytest
from plates import (
    NOT_IDENTIFIED,
    NOT_MEASURED,
    bound_device_ids,
    device_of,
    joins,
    read,
    shares_no_device_with_the_bays,
)

from synoptics.models import (
    AttributeSlot,
    Cell,
    PipeEndpoint,
    PortEndpoint,
    SynopticDocument,
)

PUMP_HEADS = {"a": "72cc846bcccc41f5", "b": "173e8e56d4d84473"}
"""The twin's two heads on the instance, PEG E2-A and PEG E2-B."""
CONTROLLER = "71c980107f9448e7"
"""The sub-station controller's device for both productions' contacts."""
CIRCUITS = ("vcv-rdc", "cta", "vcv-chambres")
CHANGE_OVER = ("vcv-rdc", "vcv-chambres")


@pytest.fixture
def plate() -> SynopticDocument:
    return SynopticDocument.model_validate(read("production-froid"))


def test_the_plate_shares_only_the_controller_with_the_hot_plate(plate):
    """The two productions read the same sub-station controller, but every
    pump is its own machine: a PEC id copied onto a PEG head would read the
    hot pump and still validate. The bays share nothing with it."""
    chaud = SynopticDocument.model_validate(read("production-chaud"))
    assert bound_device_ids(plate) & bound_device_ids(chaud) == {CONTROLLER}
    assert shares_no_device_with_the_bays(plate)


def test_the_twin_pump_is_two_heads_on_two_branches(symbols, pipes):
    """One twin pump on the view, two devices on the instance: head A above
    head B as the view stacks them, each on its own branch off the trunk,
    animated by its own state, and the view's two pressure dials read each
    head's differential head, the stopped head's sentinel included (a
    displayed number is raw)."""
    for head, device_id in PUMP_HEADS.items():
        pump = symbols[f"pompe-peg-e2-{head}"]
        branch = pipes[f"peg-e2-{head}-branch"]
        assert pump.device_id == device_id
        assert pump.placement.pipe == branch.id
        assert device_of(pump.bindings["state"]) == device_id
        assert pump.bindings["state"].labels == {"true": "MARCHE", "false": "ARRÊT"}
        assert device_of(pump.bindings["speed"]) == device_id
        assert pump.bindings["speed"].unit == "tr/min"
        assert device_of(branch.flow) == device_id
        pression = next(t for t in branch.tags if t.id == f"pression-peg-e2-{head}")
        assert device_of(pression.value) == device_id
        assert (pression.value.target.attribute, pression.value.unit) == (
            "head",
            "bar",
        )
    rows = [symbols[f"pompe-peg-e2-{h}"].placement.cell.y for h in PUMP_HEADS]
    assert rows == sorted(rows)
    # The trunk ends in a tee onto the top branch, as the hot plate's does:
    # two runs ending on one bare cell would read as a junction at grade.
    assert pipes["sec-supply"].to == PipeEndpoint(
        pipe="peg-e2-a-branch", cell=Cell(x=16, y=-11)
    )
    assert pipes["peg-e2-b-branch"].from_ == PipeEndpoint(
        pipe="sec-supply", cell=Cell(x=16, y=-4)
    )


def test_the_three_circuits_are_plain(symbols, pipes, tags):
    """No crossover on this view: each circuit is a departure, a valve, a
    link and a return with its meter, and no cold leg or second valve. The
    change-over readings stay unidentified, the CTA's unmeasured."""
    assert set(pipes) == {
        "prim-supply",
        "prim-return",
        "sec-supply",
        "sec-supply-out",
        "peg-e2-a-branch",
        "peg-e2-b-branch",
        "sec-return",
        "vase-connection",
        "ec-balance",
        *(f"{k}-{leg}" for k in CIRCUITS for leg in ("depart", "retour")),
    }
    for k, port in zip(CIRCUITS, ("1", "2", "3"), strict=True):
        assert pipes[f"{k}-depart"].from_ == PortEndpoint(
            symbol="collector-supply", port=f"out_{port}"
        )
        assert pipes[f"{k}-retour"].to == PortEndpoint(
            symbol="collector-return", port=f"in_{port}"
        )
        assert (pipes[f"{k}-depart"].fluid, pipes[f"{k}-retour"].fluid) == (
            "chilled_supply",
            "chilled_return",
        )
        expected = NOT_IDENTIFIED if k in CHANGE_OVER else NOT_MEASURED
        assert symbols[f"v-{k}"].bindings == {"state": expected}
        assert tags[f"tt-{k}-depart"] == (f"{k}-depart", expected)
        assert tags[f"tt-{k}-retour"] == (f"{k}-retour", NOT_MEASURED)
        assert symbols[f"cpt-{k}"].bindings == {"energy": NOT_MEASURED}
    valves = [s for s in symbols.values() if s.type == "valve_isolation"]
    assert len(valves) == 3


def test_the_balance_line_leaves_for_the_hot_production(symbols, pipes):
    """The hot view draws a leg from the cold production arriving in its
    return at VEC 04; this view does not draw it, but the operator clicks
    through both ways, so the same leg leaves this plate at its vessel into
    the "VERS PRODUCTION EC" link. One pipe, one direction: it arrives on the
    hot plate, so here it goes out through the link's inlet. Its target, like
    every link's, is set on the instance, never in the committed file."""
    link = symbols["link-production-ec"]
    assert link.label == "VERS PRODUCTION EC"
    assert pipes["ec-balance"].from_ == PipeEndpoint(
        pipe="vase-connection", cell=Cell(x=24, y=3)
    )
    assert pipes["ec-balance"].to == PortEndpoint(
        symbol="link-production-ec", port="in"
    )
    assert pipes["ec-balance"].fluid == "chilled_return"
    links = [s for s in symbols.values() if s.type == "link"]
    assert len(links) == 5


def test_the_primary_counter_reads_the_meter_s_register(symbols):
    """The register has read one value since June while power and flow move
    every poll; it is displayed raw all the same (a frozen register is the
    driver's to explain, not a plate's to hide), so the chip reads what the
    hot plate's does, in the unit inferred there."""
    meter = symbols["cpt-eg-ech-04"]
    energy = meter.bindings["energy"]
    assert meter.device_id == "0b747b02e8e84cea"
    assert isinstance(energy, AttributeSlot)
    assert energy.target.attribute == "energie"
    assert (energy.unit, energy.decimals) == ("Wh", 0)
    assert device_of(energy) == meter.device_id


def test_the_three_temperatures_read_the_meter_and_the_controller(symbols, tags):
    """Two probes of the heat meter and one of the controller, the cold
    exchanger's: the hot exchanger's departure sits on the same controller
    device and would read 55 °C on a chilled run and still validate."""
    _, depart = tags["tt-primaire-depart"]
    _, retour = tags["tt-primaire-retour"]
    _, secondaire = tags["tt-secondaire-depart"]
    meter = symbols["cpt-eg-ech-04"].device_id
    assert device_of(depart) == device_of(retour) == meter
    assert device_of(secondaire) == CONTROLLER
    assert (depart.target.attribute, retour.target.attribute) == (
        "tmpdepart",
        "tmpretour",
    )
    assert secondaire.target.attribute == "echeg_tmpdepart"
    for reading in (depart, retour, secondaire):
        assert (reading.unit, reading.decimals) == ("°C", 1)


def test_the_return_side_reads_the_controller_s_contacts(symbols, pipes):
    """The cold production's low-water switch and pot contact, physical
    inputs on the controller both productions share: the hot production's
    `ec04_*` contacts sit on the same device and would validate."""
    pot = symbols["pot-a-boue"]
    assert (pot.type, pot.placement.pipe) == ("dirt_separator", "sec-return")
    assert pot.bindings["fault"].target.attribute == "eg04_defpotboue"
    manque = next(t for t in pipes["sec-return"].tags if t.id == "tt-manque-eau")
    assert manque.value.target.attribute == "eg04_defmanqueeau"
    assert device_of(manque.value) == device_of(pot.bindings["fault"]) == CONTROLLER
    for slot in (manque.value, pot.bindings["fault"]):
        assert slot.labels == {"true": "DÉFAUT", "false": "NORMAL"}
    assert joins(pipes["vase-connection"].from_, "sec-return")
    assert pipes["vase-connection"].to == PortEndpoint(symbol="vec-04", port="in")


def test_the_fluids_are_keyed_by_circuit_role(pipes):
    """A run keyed as the hot template's fluid would take the heating palette
    on a chilled plate and still validate."""
    fluid = {p.id: p.fluid for p in pipes.values()}
    supply = ("sec-supply", "sec-supply-out", "peg-e2-a-branch", "peg-e2-b-branch")
    ret = ("sec-return", "vase-connection", "ec-balance")
    assert fluid["prim-supply"] == "primary_supply"
    assert fluid["prim-return"] == "primary_return"
    assert {fluid[p] for p in supply} == {"chilled_supply"}
    assert {fluid[p] for p in ret} == {"chilled_return"}
    assert set(fluid.values()) == {
        "primary_supply",
        "primary_return",
        "chilled_supply",
        "chilled_return",
    }


def test_the_labels_are_the_drawing_s_words(plate, symbols):
    """The view's own text or nothing; fifteen labels were renamed EC to EG
    off the hot template by hand, so a leftover hot name is the copied
    file's own error, and a label on a valve would hide the control valve's
    M mark."""
    assert [(label.role, label.text) for label in plate.labels] == [
        ("title", "PRODUCTION FROID")
    ]
    assert symbols["ech-eg04"].label == "ECH EG04"
    assert symbols["vec-04"].label == "VASE D'EXPANSION VEC 04"
    assert symbols["separateur-air"].label == "SÉPARATEUR D'AIR"
    assert symbols["pot-a-boue"].label == "POT À BOUE"
    assert symbols["link-batiment-d"].label == "DEPUIS BÂTIMENT D"
    assert symbols["link-production-ec"].label == "VERS PRODUCTION EC"
    assert symbols["link-vcv-rdc"].label == "CIRCUIT CHANGE-OVER VCV RDC"
    assert symbols["link-cta"].label == "CIRCUIT CTA / RADIATEUR / RAC"
    assert symbols["link-vcv-chambres"].label == "CIRCUIT CHANGE-OVER VCV CHAMBRES"
    assert symbols["cpt-eg-ech-04"].label == "CPT-EG-ECH-04"
    assert [symbols[f"cpt-{k}"].label for k in CIRCUITS] == [
        "CPT-EG-VCO",
        "CPT-EG-CTA",
        "CPT-EG-CHAMBRES",
    ]
    assert all(
        s.label is None
        for s in symbols.values()
        if s.type in ("valve_isolation", "valve_control", "collector")
    )
    assert [symbols[f"pompe-peg-e2-{h}"].label for h in PUMP_HEADS] == [
        "PEG-E2 A",
        "PEG-E2 B",
    ]
