"""Postgres resource transaction and compare-and-swap contracts."""

from unittest.mock import AsyncMock, MagicMock

import pytest
from unit.storage.test_presentation_resources import driver, resource

from devices_manager.storage.driver_record import to_record
from devices_manager.storage.postgres.driver_storage import PostgresDriverStorage
from devices_manager.storage.postgres.presentation_resources import (
    PostgresPresentationResources,
)
from models.errors import ConflictError, NotFoundError


@pytest.fixture
def pool():
    pool = MagicMock()
    pool.execute = AsyncMock(return_value="INSERT 0 1")
    pool.fetch = AsyncMock(return_value=[])
    pool.fetchrow = AsyncMock(return_value=None)
    connection = pool.acquire.return_value.__aenter__.return_value
    connection.transaction = MagicMock()
    connection.execute = pool.execute
    connection.fetch = pool.fetch
    connection.fetchrow = pool.fetchrow
    return pool


def row():
    image = resource()
    return {
        "asset_id": "asset",
        "data": image.data,
        "media_type": image.media_type,
        "sha256": image.sha256,
        "width": 1,
        "height": 1,
    }


@pytest.mark.asyncio
async def test_write_revision_transaction_and_normalized_fields(pool):
    storage = PostgresPresentationResources(pool)
    await storage.write_revision("demo", "rev", {"asset": resource()})
    connection = pool.acquire.return_value.__aenter__.return_value
    connection.transaction.return_value.__aenter__.assert_awaited_once()
    connection.transaction.return_value.__aexit__.assert_awaited_once()
    query, *args = connection.execute.await_args.args
    assert query.startswith("INSERT INTO dm_presentation_resources")
    assert args == [
        "demo",
        "rev",
        "asset",
        "image/png",
        resource().sha256,
        1,
        1,
        resource().data,
    ]


@pytest.mark.asyncio
@pytest.mark.parametrize("changed", [False, True])
async def test_existing_revision_idempotent_or_conflict(pool, changed):
    storage = PostgresPresentationResources(pool)
    connection = pool.acquire.return_value.__aenter__.return_value
    connection.fetch.return_value = [row()]
    if changed:
        with pytest.raises(ConflictError):
            await storage.write_revision("demo", "rev", {"asset": resource(b"other")})
    else:
        await storage.write_revision("demo", "rev", {"asset": resource()})
    assert connection.execute.await_count == 1  # advisory lock only


@pytest.mark.asyncio
async def test_read_list_delete_prune(pool):
    storage = PostgresPresentationResources(pool)
    with pytest.raises(NotFoundError):
        await storage.read("demo", "rev", "asset")
    pool.fetchrow.return_value = row()
    assert (await storage.read("demo", "rev", "asset")).data == resource().data
    pool.fetch.return_value = [{"revision": "first"}, {"revision": "second"}]
    assert await storage.list_revisions("demo") == ["first", "second"]
    await storage.delete_revision("demo", "first")
    assert pool.execute.await_args.args[1:] == ("demo", "first")
    await storage.prune("demo", {"second"})
    assert pool.execute.await_args.args[1:] == ("demo", ["second"])


@pytest.mark.asyncio
async def test_installation_unlocks_after_error(pool):
    storage = PostgresPresentationResources(pool)
    with pytest.raises(RuntimeError, match="failure"):
        async with storage.installation("demo"):
            raise RuntimeError("failure")
    connection = pool.acquire.return_value.__aenter__.return_value
    assert "pg_advisory_unlock" in connection.execute.await_args.args[0]


@pytest.mark.asyncio
@pytest.mark.parametrize(
    ("expected", "command", "conflict"),
    [
        (None, "INSERT 0 1", False),
        (None, "INSERT 0 0", True),
        ("first", "UPDATE 1", False),
        ("first", "UPDATE 0", True),
    ],
)
async def test_driver_snapshot_cas_checks_affected_row(
    pool, expected, command, conflict
):
    storage = PostgresDriverStorage(pool)
    pool.execute.return_value = command
    before = driver(expected) if expected is not None else None
    if before is not None:
        columns = storage._record_to_columns(before.id, to_record(before))  # noqa: SLF001
        pool.fetchrow.return_value = dict(
            zip(
                (
                    "id",
                    "vendor",
                    "model",
                    "type",
                    "transport",
                    "created_at",
                    "updated_at",
                    "data",
                ),
                columns,
                strict=True,
            )
        )
    if conflict:
        with pytest.raises(ConflictError):
            await storage.compare_and_swap(driver("second"), before)
    else:
        await storage.compare_and_swap(driver("second"), before)
    query, *args = pool.execute.await_args.args
    if before is None:
        assert "DO NOTHING" in query
    else:
        assert "updated_at=$14 AND data=$15" in query
        assert args[-1]["presentation_revision"] == "first"
    assert args[7]["presentation_revision"] == "second"


@pytest.mark.asyncio
async def test_installation_reuses_one_connection_for_resources_and_driver(pool):
    from devices_manager.storage.postgres.session import PostgresSession

    session = PostgresSession(pool)
    resources = PostgresPresentationResources(session)
    drivers = PostgresDriverStorage(session)
    async with resources.installation("demo"):
        await resources.write_revision("demo", "rev", {"asset": resource()})
        await drivers.compare_and_swap(driver("rev"), None)
        await resources.prune("demo", {"rev"})
    # A pool with one connection must not deadlock by acquiring a second one.
    assert pool.acquire.call_count == 1


@pytest.mark.asyncio
@pytest.mark.parametrize("missing", [False, True])
async def test_driver_snapshot_cas_rejects_changed_or_deleted_record(pool, missing):
    storage = PostgresDriverStorage(pool)
    before = driver("first")
    if not missing:
        stored = to_record(before).model_dump(mode="json")
        stored["vendor"] = "changed elsewhere"
        pool.fetchrow.return_value = {
            "id": before.id,
            "vendor": stored["vendor"],
            "model": stored["model"],
            "type": stored["type"],
            "transport": stored["transport"],
            "created_at": before.metadata.created_at,
            "updated_at": before.metadata.updated_at,
            "data": stored,
        }
    with pytest.raises(ConflictError):
        await storage.compare_and_swap(driver("second"), before)
    pool.execute.assert_not_awaited()
