"""The committed plate is the acceptance case for this package.

``docs/specs/synoptic/ecs-est.json`` is not a fixture: it is the plate the
format spec produced, the one this package must store and the renderer must
draw. If it stops validating, either the format moved or this package did.
"""

import pytest
import pytest_asyncio

from synoptics.models import ENVELOPE_FIELDS, SynopticDocument
from synoptics.service import SynopticsService
from synoptics.symbols import build_default_registry
from synoptics.validation import bound_slots, validate_document


@pytest.fixture
def plate(ecs_est_raw):
    return SynopticDocument.model_validate(ecs_est_raw)


@pytest_asyncio.fixture
async def service(resolver):
    svc = SynopticsService(storage_url=None, target_resolver=resolver)
    await svc.start()
    yield svc
    await svc.stop()


def test_the_plate_parses(plate):
    assert plate.name == "Production ECS Est"
    assert (len(plate.symbols), len(plate.pipes), len(plate.labels)) == (23, 34, 5)


def test_the_plate_validates(plate):
    validate_document(plate, build_default_registry())


def test_the_plate_binds_exactly_the_spec_inventory(plate):
    """Thirty live values: 21 symbol slots, 5 tag readings, 4 animated runs."""
    slots = bound_slots(plate)
    assert len(slots) == 30
    assert sum(s.is_flow for s in slots) == 4
    assert sum(s.loc[0] == "symbols" for s in slots) == 21


def test_the_plate_uses_only_registered_types(plate):
    registered = set(build_default_registry().types())
    assert {s.type for s in plate.symbols} <= registered


def test_the_plate_carries_the_shapes_the_format_had_to_confront(plate):
    """Inline equipment, a tee, readings on a run and an authored collector are
    the four shapes the spec set out to hold."""
    placements = {s.placement.kind for s in plate.symbols}
    assert "pipe" in placements, "inline equipment"

    endpoints = {p.from_.kind for p in plate.pipes} | {p.to.kind for p in plate.pipes}
    assert "pipe" in endpoints, "a tee onto another run"

    assert any(p.tags for p in plate.pipes), "readings riding on a run"
    assert any(s.type == "collector" and s.props for s in plate.symbols)


def test_the_plate_holds_no_rendering(ecs_est_raw):
    """The store holds the description, never a drawing. A field named for a
    visual choice means the format leaked."""
    forbidden = ("style", "color", "colour", "width", "dashed", "z_index")
    text = str(ecs_est_raw)
    for field in forbidden:
        assert f"'{field}'" not in text


@pytest.mark.asyncio
async def test_the_plate_round_trips_through_the_service(service, plate, ecs_est_raw):
    """Storing this document successfully is the milestone's exit."""
    stored = await service.create(plate)
    read = await service.get(stored.id)

    authored = read.model_dump(mode="json", by_alias=True, exclude=ENVELOPE_FIELDS)
    assert authored == SynopticDocument.model_validate(ecs_est_raw).model_dump(
        mode="json", by_alias=True
    )


@pytest.mark.asyncio
async def test_the_plate_appears_in_the_index(service, plate):
    stored = await service.create(plate)
    page = await service.list()
    assert [(s.id, s.name) for s in page.items] == [(stored.id, "Production ECS Est")]
