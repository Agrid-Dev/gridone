"""Service behaviour against the real in-memory backend. Public API only."""

import pytest
import pytest_asyncio

from models.errors import ConflictError, NotFoundError, SchemaValidationError
from models.pagination import PaginationParams
from synoptics.models import SynopticDocument
from synoptics.service import SynopticsService

pytestmark = pytest.mark.asyncio


@pytest_asyncio.fixture
async def service():
    svc = SynopticsService(storage_url=None)
    await svc.start()
    yield svc
    await svc.stop()


@pytest.fixture
def plate(document):
    return SynopticDocument.model_validate(document)


async def test_create_assigns_an_id_and_metadata(service, plate):
    synoptic = await service.create(plate)
    assert len(synoptic.id) == 16
    assert synoptic.metadata.created_at is not None
    assert synoptic.name == "Test plate"
    assert len(synoptic.symbols) == 2


async def test_create_refuses_an_invalid_plate(service, document):
    """A violation is an error at save time, never a blank tile in
    production."""
    document["pipes"][0]["tags"][0]["at"] = {"x": 9, "y": 9}
    with pytest.raises(SchemaValidationError, match="Invalid synoptic"):
        await service.create(SynopticDocument.model_validate(document))


async def test_nothing_is_persisted_when_validation_fails(service, document):
    document["pipes"][0]["tags"][0]["at"] = {"x": 9, "y": 9}
    with pytest.raises(SchemaValidationError):
        await service.create(SynopticDocument.model_validate(document))
    assert (await service.list()).total == 0


async def test_get_returns_the_stored_plate(service, plate):
    created = await service.create(plate)
    assert (await service.get(created.id)).id == created.id


async def test_get_of_a_missing_plate_is_a_not_found(service):
    with pytest.raises(NotFoundError, match="not found"):
        await service.get("nope")


async def test_list_returns_summaries(service, plate):
    await service.create(plate)
    page = await service.list()
    assert page.total == 1
    assert page.items[0].name == "Test plate"


async def test_list_paginates(service, plate):
    for _ in range(3):
        await service.create(plate)
    page = await service.list(pagination=PaginationParams(page=2, size=2))
    assert (page.total, page.page, len(page.items)) == (3, 2, 1)


async def test_replace_keeps_the_id_and_the_creation_time(service, plate, document):
    created = await service.create(plate)
    document["name"] = "Renamed"
    replaced = await service.replace(
        created.id, SynopticDocument.model_validate(document)
    )
    assert replaced.id == created.id
    assert replaced.name == "Renamed"
    assert replaced.metadata.created_at == created.metadata.created_at
    assert replaced.metadata.updated_at >= created.metadata.updated_at


async def test_replace_refuses_a_stale_read(service, plate, document):
    """An author who read the plate before someone else saved it gets a
    conflict, not a silent overwrite of the other person's work."""
    created = await service.create(plate)
    seen = created.metadata.updated_at
    document["name"] = "First"
    await service.replace(
        created.id,
        SynopticDocument.model_validate(document),
        expected_updated_at=seen,
    )
    document["name"] = "Second"
    with pytest.raises(ConflictError):
        await service.replace(
            created.id,
            SynopticDocument.model_validate(document),
            expected_updated_at=seen,
        )
    assert (await service.get(created.id)).name == "First"


async def test_replace_with_a_current_read_succeeds(service, plate, document):
    created = await service.create(plate)
    document["name"] = "Renamed"
    replaced = await service.replace(
        created.id,
        SynopticDocument.model_validate(document),
        expected_updated_at=created.metadata.updated_at,
    )
    assert replaced.name == "Renamed"


async def test_replace_validates_before_writing(service, plate, document):
    created = await service.create(plate)
    document["pipes"][0]["tags"][0]["at"] = {"x": 9, "y": 9}
    with pytest.raises(SchemaValidationError):
        await service.replace(created.id, SynopticDocument.model_validate(document))
    assert (await service.get(created.id)).name == "Test plate"


async def test_replace_of_a_missing_plate_is_a_not_found(service, plate):
    with pytest.raises(NotFoundError):
        await service.replace("nope", plate)


async def test_delete(service, plate):
    created = await service.create(plate)
    await service.delete(created.id)
    with pytest.raises(NotFoundError):
        await service.get(created.id)


async def test_delete_of_a_missing_plate_is_a_not_found(service):
    with pytest.raises(NotFoundError):
        await service.delete("nope")


async def test_symbol_schemas_come_from_the_registry(service):
    schemas = service.symbol_schemas()
    assert "heat_pump" in schemas
    assert schemas["heat_pump"]["x-footprint"] == {"w": 2, "d": 2}


async def test_stop_before_start_is_safe():
    """The composition root may tear down a service whose start failed."""
    await SynopticsService(storage_url=None).stop()


async def test_an_unsupported_url_fails_at_start():
    from models.errors import UnsupportedStorageError

    with pytest.raises(UnsupportedStorageError):
        await SynopticsService(storage_url="mysql://host/db").start()
