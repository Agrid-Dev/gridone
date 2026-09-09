"""The in-memory backend: isolation and the not-found contract."""

import pytest

from models.errors import ConflictError, NotFoundError
from models.metadata import ResourceMetadata
from synoptics.models import Synoptic
from synoptics.storage import MemoryStorage

pytestmark = pytest.mark.asyncio


def make(synoptic_id: str, name: str = "Plate") -> Synoptic:
    return Synoptic(id=synoptic_id, name=name, metadata=ResourceMetadata())


@pytest.fixture
def storage():
    return MemoryStorage()


async def test_create_then_get(storage):
    await storage.create(make("a"))
    assert (await storage.get("a")).name == "Plate"


async def test_creating_over_an_existing_id_is_a_conflict(storage):
    """Silently overwriting destroys a plate; the real backend has a primary
    key, so the two must agree on what happens."""
    await storage.create(make("a", name="First"))
    with pytest.raises(ConflictError):
        await storage.create(make("a", name="Second"))
    assert (await storage.get("a")).name == "First"


async def test_get_returns_none_when_missing(storage):
    assert await storage.get("nope") is None


async def test_reads_are_isolated_from_the_store(storage):
    """The same isolation a real database gives: mutating what you got back
    must not reach persisted state."""
    await storage.create(make("a"))
    read = await storage.get("a")
    read.name = "Mutated"
    assert (await storage.get("a")).name == "Plate"


async def test_writes_are_isolated_from_the_caller(storage):
    synoptic = make("a")
    await storage.create(synoptic)
    synoptic.name = "Mutated"
    assert (await storage.get("a")).name == "Plate"


async def test_update_replaces_the_document(storage):
    await storage.create(make("a"))
    updated = make("a", name="Renamed")
    assert (await storage.update(updated)).name == "Renamed"
    assert (await storage.get("a")).name == "Renamed"


async def test_update_of_a_missing_plate_is_a_not_found(storage):
    with pytest.raises(NotFoundError):
        await storage.update(make("nope"))


async def test_delete(storage):
    await storage.create(make("a"))
    await storage.delete("a")
    assert await storage.get("a") is None


async def test_delete_of_a_missing_plate_is_a_not_found(storage):
    with pytest.raises(NotFoundError):
        await storage.delete("nope")


async def test_count(storage):
    assert await storage.count() == 0
    await storage.create(make("a"))
    await storage.create(make("b"))
    assert await storage.count() == 2


async def test_summaries_carry_the_envelope_only(storage):
    await storage.create(make("a"))
    summary = (await storage.list_summaries())[0]
    assert (summary.id, summary.name, summary.projection) == ("a", "Plate", "isometric")
    assert not hasattr(summary, "symbols")


async def test_summaries_paginate(storage):
    for i in range(5):
        await storage.create(make(f"plate-{i}"))
    page = await storage.list_summaries(limit=2, offset=1)
    assert [s.id for s in page] == ["plate-1", "plate-2"]


async def test_close_is_a_no_op(storage):
    await storage.close()
