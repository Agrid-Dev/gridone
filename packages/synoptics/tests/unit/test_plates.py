"""The committed plates are the acceptance cases for this package.

Every plate in ``docs/specs/synoptic/`` is held to the same probes here: it
parses, validates, binds only what its drawing shows, names the instance's
own devices, marks what no device reads, and stores without loss. What one
plate's drawing decides on its own (its bay, its captions) lives in that
plate's file next to this one.
"""

from collections import Counter
from dataclasses import dataclass

import pytest
import pytest_asyncio
from plates import PLATE_NAMES, read

from models.ids import ID_PATTERN
from models.targets import DevicesFilter
from synoptics.geometry import polyline_cells, rotate_offset, translate
from synoptics.models import (
    ENVELOPE_FIELDS,
    Cell,
    CellEndpoint,
    CellPlacement,
    PipeEndpoint,
    PortEndpoint,
    Symbol,
    SynopticDocument,
    TextSlot,
)
from synoptics.service import SynopticsService
from synoptics.symbols.registry import build_default_registry
from synoptics.validation import bound_slots, overlaps, validate_document


@dataclass(frozen=True)
class Expected:
    counts: tuple[int, int, int]
    """Symbols, pipes, labels."""
    bindings: dict[str, int]
    """Live values by kind: symbol slots, label readings, animated runs."""


EXPECTED = {
    "Production ECS Est": Expected((21, 21, 5), {"symbols": 4, "labels": 1, "flow": 2}),
    "Production ECS Ouest": Expected(
        (23, 24, 5), {"symbols": 4, "labels": 1, "flow": 2}
    ),
}


@pytest.fixture
def plate(plate_raw):
    return SynopticDocument.model_validate(plate_raw)


@pytest.fixture
def expected(plate):
    return EXPECTED[plate.name]


@pytest_asyncio.fixture
async def service(resolver):
    svc = SynopticsService(storage_url=None, target_resolver=resolver)
    await svc.start()
    yield svc
    await svc.stop()


def test_every_committed_plate_is_expected_here():
    """A plate dropped into the folder without a row above would run the
    probes against nothing in particular."""
    assert {read(name)["name"] for name in PLATE_NAMES} == set(EXPECTED)


def test_the_plate_parses(plate, expected):
    assert (len(plate.symbols), len(plate.pipes), len(plate.labels)) == expected.counts


def test_the_plate_validates(plate, registry):
    validate_document(plate, registry)


def test_the_plate_binds_exactly_the_live_inventory(plate, expected):
    """Only what the source drawing shows and a device exposes is bound: PAC
    state and fault, the energy counter, the two supply runs. A tank
    temperature or a mitigeur ``supply_temp`` would be a value the drawing
    does not show."""
    kinds = Counter("flow" if s.is_flow else s.loc[0] for s in bound_slots(plate))
    assert kinds == expected.bindings


def test_every_binding_names_a_real_device(plate):
    """Placeholder tokens (``PAC-03``, ``ECS-EST-CTRL``) were the spec's; a
    live plate names the instance's own device ids, one per slot, and selects
    by nothing else."""
    for slot in bound_slots(plate):
        devices = slot.slot.target.devices
        ids = devices.ids or []
        assert len(ids) == 1, slot.loc
        assert ID_PATTERN.match(ids[0]), slot.loc
        assert devices == DevicesFilter(ids=ids), slot.loc
    for symbol in plate.symbols:
        if symbol.device_id:
            assert ID_PATTERN.match(symbol.device_id), symbol.id


def test_no_link_names_a_plate(plate):
    """The old GTB's "Vue Production ECS CH EST / OUEST" buttons are
    navigation, not off-page pipes, so neither plate places a folio link to
    the other: both links are inert boundaries and the index is the way
    between the bays."""
    links = [s for s in plate.symbols if s.type == "link"]
    assert links
    assert all(s.props.get("synoptic_id") is None for s in links)


def test_the_mitigeur_readings_say_they_are_not_measured(plate):
    """Both drawings show the mitigeur départ and retour; no device on the
    instance reads either station's (the WAGO registers have read 0 since
    June, the gateway's optional probes are not fitted). Each rides its run
    as a tag carrying a text slot that says so, never a probe that reads
    something else and never a silent gap: the départ on the mitigeur's
    outlet, the retour on the bouclage return, where the panoplie's sensors
    sit."""
    not_measured = TextSlot(text="non mesurée")
    assert {t.id: (p.id, t.value) for p in plate.pipes for t in p.tags} == {
        "tt-depart": ("dhw-supply", not_measured),
        "tt-retour": ("dhw-loop-return", not_measured),
    }
    assert next(s for s in plate.symbols if s.id == "mitigeur").bindings == {}


def test_the_tags_project_onto_distinct_columns(plate):
    """In the 2:1 projection two cells with the same ``x - y`` land on one
    screen column, so a tag at (29, -3) and one at (30, -2) would stack their
    chips."""
    tags = [t for p in plate.pipes for t in p.tags]
    columns = [t.at.x - t.at.y for t in tags]
    assert len(set(columns)) == len(tags)


def test_no_two_runs_meet_at_grade_outside_a_tee(plate, registry):
    """Two runs sharing a cell at one height read as a junction. The feeds
    cross the departure risers overhead."""
    assert overlaps(plate, registry) == {}


def test_the_plate_uses_only_registered_types(plate, registry):
    assert {s.type for s in plate.symbols} <= set(registry.types())


def test_the_plate_is_one_sanitary_circuit(plate):
    """The heat pumps heat the sanitary water directly, so a plate has one
    circuit: the production loop (heat pumps, bay, back) keyed `primary_*`,
    the departure `dhw`, the bouclage `dhw_loop`, and cold water twice, as
    the make-up on the return to the heat pumps and as the mitigeur's cold
    inlet, never on a tank."""
    fluid = {p.id: p.fluid for p in plate.pipes}
    pac_supply = [p for p in plate.pipes if p.id.startswith("pac-") and p.flow]
    assert len(pac_supply) == 2
    assert {p.fluid for p in pac_supply} == {fluid["feed-col-1"]} == {"primary_supply"}
    assert fluid["col-1-return"] == fluid["return-loop"] == "primary_return"
    assert fluid["col-1-dhw-out"] == fluid["dhw-supply"] == "dhw"
    assert fluid["dhw-loop-return"] == "dhw_loop"
    assert fluid["cold-main"] == fluid["efa-mitigeur"] == "cold_water"
    assert set(fluid.values()) == {
        "primary_supply",
        "primary_return",
        "dhw",
        "dhw_loop",
        "cold_water",
    }
    pipes = {p.id: p for p in plate.pipes}
    assert pipes["cold-main"].to == PortEndpoint(symbol="collector-return", port="in_4")


def _cells_along(plate: SynopticDocument, pipe_id: str) -> list[Cell]:
    """Every cell of a run in flow order, endpoints resolved through the
    registry, so a position on the run can be compared with another."""
    registry = build_default_registry()
    symbols = {s.id: s for s in plate.symbols}

    def resolve(end: PortEndpoint | CellEndpoint | PipeEndpoint) -> Cell:
        if not isinstance(end, PortEndpoint):
            return end.cell
        symbol = symbols[end.symbol]
        placement = symbol.placement
        rotation = placement.rotation if isinstance(placement, CellPlacement) else 0
        port = registry.ports_of(symbol)[end.port]
        return translate(placement.cell, rotate_offset(port.offset, rotation))

    pipe = next(p for p in plate.pipes if p.id == pipe_id)
    return polyline_cells([resolve(pipe.from_), *pipe.waypoints, resolve(pipe.to)])


def test_the_panoplie_is_the_p_and_id_s(plate):
    """The panoplie P&IDs ("Départ EC 104 / 80 Chambres") draw what the GTB
    view leaves out, on both plates: on the retour ECS a pompe de bouclage
    then a réchauffeur de boucle before the water goes back to the tanks,
    never to the mitigeur; on the départ a pompe de surpression before the
    mitigeur; and the
    mitigeur's cold inlet fed by eau froide adoucie. The bay's pump pair and
    heater are read by the iSMA controller but not yet identified, so their
    states are marked, not bound to a guessed pair."""
    symbols = {s.id: s for s in plate.symbols}
    pipes = {p.id: p for p in plate.pipes}

    def on(s: Symbol) -> tuple[str, str | None]:
        return (s.placement.kind, getattr(s.placement, "pipe", None))

    assert (symbols["pompe-bouclage"].type, on(symbols["pompe-bouclage"])) == (
        "pump",
        ("pipe", "dhw-loop-return"),
    )
    assert (symbols["rechauffeur-boucle"].type, on(symbols["rechauffeur-boucle"])) == (
        "loop_heater",
        ("pipe", "dhw-loop-return"),
    )
    assert (symbols["pompe-surpression"].type, on(symbols["pompe-surpression"])) == (
        "pump",
        ("pipe", "dhw-departure"),
    )
    # The loop return ends in the bay, on a tank's dhw inlet.
    assert pipes["dhw-loop-return"].to.kind == "port"
    assert pipes["dhw-loop-return"].to.port == "dhw_in"
    assert symbols[pipes["dhw-loop-return"].to.symbol].type == "tank"
    # In flow order from the link: the retour sensor, the pump, the heater.
    along = _cells_along(plate, "dhw-loop-return")
    order = [
        along.index(cell)
        for cell in (
            pipes["dhw-loop-return"].tags[0].at,
            symbols["pompe-bouclage"].placement.cell,
            symbols["rechauffeur-boucle"].placement.cell,
        )
    ]
    assert order == sorted(order)
    not_identified = TextSlot(text="non identifiée")
    assert symbols["pompe-bouclage"].bindings == {"state": not_identified}
    assert symbols["rechauffeur-boucle"].bindings == {
        "state": not_identified,
        "fault": not_identified,
    }
    assert symbols["pompe-surpression"].bindings == {}
    assert symbols["link-efa"].type == "link"
    assert pipes["efa-mitigeur"].fluid == "cold_water"
    assert pipes["efa-mitigeur"].from_ == PortEndpoint(symbol="link-efa", port="out")
    assert pipes["efa-mitigeur"].to == PortEndpoint(symbol="mitigeur", port="cold_in")


def test_every_tank_is_unnamed_and_fed_once(plate):
    """The drawings label every ballon "Ballon ECS Q TON 500L" and number
    none, so no tank carries a label; and every tank is fed at its upper
    inlet by exactly one run, so no column is left hanging and none is fed
    twice."""
    tanks = [s for s in plate.symbols if s.type == "tank"]
    assert tanks
    assert all(t.label is None for t in tanks)
    fed = Counter(
        p.to.symbol
        for p in plate.pipes
        if isinstance(p.to, PortEndpoint) and p.to.port == "primary_in"
    )
    assert fed == {t.id: 1 for t in tanks}


def test_the_plate_carries_the_shapes_the_format_had_to_confront(plate):
    """Inline equipment, a tee, readings on a run and an authored collector are
    the four shapes the spec set out to hold."""
    placements = {s.placement.kind for s in plate.symbols}
    assert "pipe" in placements, "inline equipment"

    endpoints = {p.from_.kind for p in plate.pipes} | {p.to.kind for p in plate.pipes}
    assert "pipe" in endpoints, "a tee onto another run"

    assert any(p.tags for p in plate.pipes), "readings riding on a run"
    assert any(s.type == "collector" and s.props for s in plate.symbols)


def test_the_plate_holds_no_rendering(plate_raw):
    """The store holds the description, never a drawing. A field named for a
    visual choice means the format leaked."""
    forbidden = ("style", "color", "colour", "width", "dashed", "z_index")
    text = str(plate_raw)
    for field in forbidden:
        assert f"'{field}'" not in text


@pytest.mark.asyncio
async def test_the_plate_round_trips_through_the_service(service, plate, plate_raw):
    """Storing this document successfully is the milestone's exit."""
    stored = await service.create(plate)
    read = await service.get(stored.id)

    authored = read.model_dump(mode="json", by_alias=True, exclude=ENVELOPE_FIELDS)
    assert authored == SynopticDocument.model_validate(plate_raw).model_dump(
        mode="json", by_alias=True
    )


@pytest.mark.asyncio
async def test_the_plates_share_the_index(service):
    """The index is how an operator moves between the bays."""
    stored = [
        await service.create(SynopticDocument.model_validate(read(name)))
        for name in PLATE_NAMES
    ]
    page = await service.list()
    assert {(s.id, s.name) for s in page.items} == {(s.id, s.name) for s in stored}
    assert {s.name for s in stored} == set(EXPECTED)
