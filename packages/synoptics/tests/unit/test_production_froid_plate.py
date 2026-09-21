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
    read,
    shares_no_device_with_the_bays,
)

from synoptics.models import Cell, PipeEndpoint, PortEndpoint, SynopticDocument

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


def test_the_primary_counter_is_marked_on_the_meter_device(symbols, tags):
    """The meter is still the click-through device, but its energy register
    has not moved since June while power and flow read live, so the chip
    says so rather than show a frozen number."""
    meter = symbols["cpt-eg-ech-04"]
    assert meter.device_id == "0b747b02e8e84cea"
    assert meter.bindings == {"energy": NOT_MEASURED}
    assert device_of(tags["tt-primaire-depart"][1]) == meter.device_id
    assert device_of(tags["tt-primaire-retour"][1]) == meter.device_id
