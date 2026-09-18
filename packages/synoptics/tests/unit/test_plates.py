"""The committed plates are the acceptance cases for this package.

Every plate in ``docs/specs/synoptic/`` is held to the same probes here: it
parses, validates, binds only what its drawing shows, names the instance's
own devices, and stores without loss. What the hot-water bays' shared
template decides is in ``test_ecs_bays.py``; what one plate's drawing
decides on its own (its bay, its captions, its manifold) lives in that
plate's file next to this one.
"""

from collections import Counter
from dataclasses import dataclass

import pytest
import pytest_asyncio
from plates import PLATE_NAMES, read

from models.ids import ID_PATTERN
from models.targets import DevicesFilter
from synoptics.models import (
    ENVELOPE_FIELDS,
    SynopticDocument,
)
from synoptics.service import SynopticsService
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
    "Production Chaud": Expected((38, 23, 1), {"symbols": 10, "pipes": 4, "flow": 4}),
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
    state and fault, the energy counter, the two supply runs on a bay; the
    four pump heads, the heat meter, the sludge pot, four readings and four
    branches on the hot production. A tank temperature or a mitigeur
    ``supply_temp`` would be a value the drawing does not show."""
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
    """The old GTB's "Vue Production ..." buttons are navigation, not
    off-page pipes, so no plate places a folio link to another: every link
    is an inert boundary (a pipe leaving the drawing, to a plate that does
    not exist yet) and the index is the way between the views."""
    links = [s for s in plate.symbols if s.type == "link"]
    assert links
    assert all(s.props.get("synoptic_id") is None for s in links)


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
