"""Integration tests for the postgres synoptics backend.

Runs the full ``SynopticsService`` against a real database so the JSONB
round-trip of a whole plate is exercised end-to-end. Opt-in via
``POSTGRES_TEST_URL``; skipped when unset so the default suite stays hermetic.
"""

import contextlib
import os

import pytest
import pytest_asyncio

from models.errors import ConflictError, NotFoundError
from models.pagination import PaginationParams
from synoptics.models import ENVELOPE_FIELDS, SynopticDocument
from synoptics.service import SynopticsService
from synoptics.storage import build_storage

POSTGRES_URL = os.environ.get("POSTGRES_TEST_URL")

pytestmark = [
    pytest.mark.asyncio,
    pytest.mark.integration,
    pytest.mark.skipif(POSTGRES_URL is None, reason="POSTGRES_TEST_URL not set"),
]


@pytest_asyncio.fixture
async def service():
    svc = SynopticsService(storage_url=POSTGRES_URL)
    await svc.start()
    created: list[str] = []
    try:
        yield svc, created
    finally:
        for synoptic_id in created:
            with contextlib.suppress(NotFoundError):
                await svc.delete(synoptic_id)
        await svc.stop()


@pytest.fixture
def plate(ecs_est_raw):
    return SynopticDocument.model_validate(ecs_est_raw)


async def test_the_plate_round_trips_through_postgres(service, plate, ecs_est_raw):
    """The milestone's exit: the hand-written plate is stored in Postgres and
    served back unchanged."""
    svc, created = service
    stored = await svc.create(plate)
    created.append(stored.id)

    read = await svc.get(stored.id)
    assert read.model_dump(
        mode="json", by_alias=True, exclude=ENVELOPE_FIELDS
    ) == SynopticDocument.model_validate(ecs_est_raw).model_dump(
        mode="json", by_alias=True
    )


async def test_the_index_reads_the_envelope_out_of_the_document(service, plate):
    """``name`` and ``projection`` live only in the JSONB, so a summary can
    never drift from the plate it describes."""
    svc, created = service
    stored = await svc.create(plate)
    created.append(stored.id)

    summaries = (await svc.list()).items
    summary = next(s for s in summaries if s.id == stored.id)
    assert (summary.name, summary.projection) == ("Production ECS Est", "isometric")


async def test_replace_and_delete(service, plate, ecs_est_raw):
    svc, created = service
    stored = await svc.create(plate)
    created.append(stored.id)

    renamed = dict(ecs_est_raw, name="Production ECS Est (rev B)")
    replaced = await svc.replace(stored.id, SynopticDocument.model_validate(renamed))
    assert replaced.name == "Production ECS Est (rev B)"
    assert (await svc.get(stored.id)).name == "Production ECS Est (rev B)"

    await svc.delete(stored.id)
    with pytest.raises(NotFoundError):
        await svc.get(stored.id)


async def test_the_index_paginates(service, plate):
    """Asserts the pages actually differ: `total >= 3` and `len <= 2` are both
    true even if OFFSET is dropped entirely, so they prove nothing."""
    svc, created = service
    for _ in range(3):
        created.append((await svc.create(plate)).id)

    first = await svc.list(pagination=PaginationParams(page=1, size=2))
    second = await svc.list(pagination=PaginationParams(page=2, size=2))

    first_ids = [s.id for s in first.items]
    second_ids = [s.id for s in second.items]
    assert len(first_ids) == 2
    assert not set(first_ids) & set(second_ids), "pages overlap"

    everything = await svc.list(pagination=PaginationParams(page=1, size=100))
    ordered = [s.id for s in everything.items]
    assert first_ids + second_ids == ordered[: len(first_ids) + len(second_ids)]


async def test_creating_over_an_existing_id_is_a_conflict(service, plate):
    """The primary key must surface as a domain error, not a raw driver
    exception the API turns into a 500."""
    svc, created = service
    stored = await svc.create(plate)
    created.append(stored.id)

    storage = await build_storage(POSTGRES_URL)
    try:
        with pytest.raises(ConflictError):
            await storage.create(stored.model_copy(deep=True))
    finally:
        await storage.close()


async def test_a_stale_replace_is_a_conflict_in_the_database(service, plate):
    """The row's timestamp is part of the UPDATE's WHERE clause, so the check
    holds even when two saves race between the service's read and its write."""
    svc, created = service
    stored = await svc.create(plate)
    created.append(stored.id)
    seen = stored.metadata.updated_at

    first = dict(plate.model_dump(by_alias=True), name="First")
    await svc.replace(
        stored.id, SynopticDocument.model_validate(first), expected_updated_at=seen
    )

    second = dict(plate.model_dump(by_alias=True), name="Second")
    with pytest.raises(ConflictError):
        await svc.replace(
            stored.id, SynopticDocument.model_validate(second), expected_updated_at=seen
        )
    assert (await svc.get(stored.id)).name == "First"


async def test_a_stale_write_is_caught_by_the_row_not_only_the_service(service, plate):
    """Bypass the service's own timestamp comparison and hit the storage
    directly with a stale ``seen_updated_at``: the SQL must refuse it."""
    svc, created = service
    stored = await svc.create(plate)
    created.append(stored.id)

    storage = await build_storage(POSTGRES_URL)
    try:
        stale = stored.model_copy(update={"name": "Stale"})
        moved = stored.model_copy(
            update={"metadata": stored.metadata.touch_updated_at()}
        )
        await storage.update(moved, seen_updated_at=stored.metadata.updated_at)
        with pytest.raises(ConflictError):
            await storage.update(stale, seen_updated_at=stored.metadata.updated_at)
    finally:
        await storage.close()


async def test_deleting_a_missing_plate_is_a_not_found(service):
    svc, _ = service
    with pytest.raises(NotFoundError):
        await svc.delete("does-not-exist")
