"""The committed plate is the acceptance case for this package.

``docs/specs/synoptic/ecs-est.json`` is not a fixture: it is the plate the
format spec produced, bound to the live installation, the one this package
must store and the renderer must draw. If it stops validating, either the
format moved or this package did.
"""

from collections import Counter

import pytest
import pytest_asyncio

from models.ids import ID_PATTERN
from models.targets import DevicesFilter
from synoptics.models import (
    ENVELOPE_FIELDS,
    PortEndpoint,
    SynopticDocument,
    TextSlot,
)
from synoptics.service import SynopticsService
from synoptics.validation import bound_slots, overlaps, validate_document


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
    assert (len(plate.symbols), len(plate.pipes), len(plate.labels)) == (17, 21, 5)


def test_the_plate_validates(plate, registry):
    validate_document(plate, registry)


def test_the_plate_binds_exactly_the_live_inventory(plate):
    """Seven live values: 4 symbol slots (PAC state and fault, twice), 1 label
    reading (the energy counter), 2 animated runs. Only what the source
    drawing shows and a device exposes is bound."""
    kinds = Counter("flow" if s.is_flow else s.loc[0] for s in bound_slots(plate))
    assert kinds == {"symbols": 4, "labels": 1, "flow": 2}


def test_every_binding_names_a_real_device(plate):
    """Placeholder tokens (``PAC-03``, ``ECS-EST-CTRL``) were the spec's; the
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


def test_no_link_names_a_plate_that_does_not_exist(plate):
    """The Ouest plate is not written; its link is an inert boundary, not a
    placeholder id that would render as a missing target."""
    links = [s for s in plate.symbols if s.type == "link"]
    assert links
    assert all(s.props.get("synoptic_id") is None for s in links)


def test_the_mitigeur_readings_say_they_are_not_measured(plate):
    """The drawing shows the mitigeur départ and retour; no device on the
    instance reads them. Each rides its run as a tag carrying a text slot
    that says so, never a probe that reads something else and never a
    silent gap: the départ on the mitigeur's outlet, the retour on the
    bouclage return, where the panoplie's sensors sit."""
    not_measured = TextSlot(text="non mesurée")
    assert {t.id: (p.id, t.value) for p in plate.pipes for t in p.tags} == {
        "tt-depart": ("dhw-supply", not_measured),
        "tt-retour": ("dhw-loop-return", not_measured),
    }
    assert next(s for s in plate.symbols if s.id == "mitigeur").bindings == {}


def test_no_two_runs_meet_at_grade_outside_a_tee(plate, registry):
    """Two runs sharing a cell at one height read as a junction. The one
    crossing on the plate, the column-2 feed over the column-1 departure
    riser, is overhead."""
    assert overlaps(plate, registry) == {}


def test_the_plate_uses_only_registered_types(plate, registry):
    assert {s.type for s in plate.symbols} <= set(registry.types())


def test_the_plate_is_one_sanitary_circuit(plate):
    """The heat pumps heat the sanitary water directly, so the plate has one
    circuit: the production loop (heat pumps, bay, back) keyed `primary_*`,
    the departure `dhw`, the bouclage `dhw_loop`, and the cold make-up on the
    return to the heat pumps rather than on a tank."""
    fluid = {p.id: p.fluid for p in plate.pipes}
    assert fluid["pac-03-supply"] == fluid["feed-col-1"] == "primary_supply"
    assert fluid["col-1-return"] == fluid["return-loop"] == "primary_return"
    assert fluid["col-1-dhw-out"] == fluid["dhw-supply"] == "dhw"
    assert fluid["dhw-loop-return"] == fluid["dhw-loop-to-storage"] == "dhw_loop"
    assert fluid["cold-main"] == "cold_water"
    assert set(fluid.values()) == {
        "primary_supply",
        "primary_return",
        "dhw",
        "dhw_loop",
        "cold_water",
    }
    pipes = {p.id: p for p in plate.pipes}
    assert pipes["cold-main"].to == PortEndpoint(symbol="collector-return", port="in_4")


def test_the_bay_is_the_drawing_s(plate):
    """Seven 500 L ballons, two columns of three and one of one; the drawing
    names none of them, so no tank carries a label. The bay's single outlet
    leaves its bottom-right ballon, so that ballon is fed along the bottom
    row, drains to the return header, and takes no departure of its own."""
    tanks = [s for s in plate.symbols if s.type == "tank"]
    assert Counter(t.placement.cell.x for t in tanks) == {10: 3, 14: 3, 18: 1}
    assert all(t.label is None for t in tanks)
    pipes = {p.id: p for p in plate.pipes}
    assert pipes["b08-b09"].from_ == PortEndpoint(symbol="b08", port="dhw_out")
    assert pipes["b08-b09"].to == PortEndpoint(symbol="b09", port="primary_in")
    assert pipes["col-3-return"].from_ == PortEndpoint(symbol="b09", port="primary_out")
    assert not any(
        p.from_ == PortEndpoint(symbol="b09", port="dhw_out") for p in plate.pipes
    )


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
