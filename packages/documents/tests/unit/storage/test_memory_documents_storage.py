from datetime import UTC, datetime

import pytest
from documents_folder_scenarios import (
    check_folders_and_archives,
    check_hidden_folders_are_read_only,
    check_subfolders_block_deletion_and_archive_dates_stick,
)

from documents import DocumentFilters, DocumentsService, DocumentUpdate
from documents.storage.memory import MemoryStorage
from models.errors import ConflictError, NotFoundError
from models.pagination import PaginationParams

pytestmark = pytest.mark.asyncio


async def test_search_and_totals_before_pagination(document):
    storage = MemoryStorage()
    for index in range(4):
        await storage.create(
            document.model_copy(
                update={
                    "id": str(index),
                    "name": document.name if index % 2 else "Other",
                }
            ),
            b"notice",
        )
    first = await storage.list(
        DocumentFilters(q="CHAUDIÈRE", asset_id="building", device_id="boiler"),
        PaginationParams(size=1),
    )
    second = await storage.list(
        DocumentFilters(q="CHAUDIÈRE", asset_id="building", device_id="boiler"),
        PaginationParams(page=2, size=1),
    )
    assert first.total == second.total == 2
    assert first.items[0].id != second.items[0].id
    assert (await storage.list(DocumentFilters(), PaginationParams())).total == 4
    assert (
        await storage.list(DocumentFilters(q="missing"), PaginationParams())
    ).total == 0
    for filters in [
        DocumentFilters(asset_id="other"),
        DocumentFilters(device_id="other"),
    ]:
        assert (await storage.list(filters, PaginationParams())).total == 0
    assert await storage.get("missing") is None
    assert await storage.get_content("missing") is None


async def test_roundtrip_copies_partial_update_and_delete(document):
    storage = MemoryStorage()
    saved = await storage.create(document, b"notice")
    saved.name = "Mutated"
    saved.asset_ids.clear()
    read = await storage.get(document.id)
    assert read is not None
    assert read.name == document.name
    assert read.asset_ids == ["building"]
    content = await storage.get_content(document.id)
    assert content is not None
    assert content.data == b"notice"
    with pytest.raises(ConflictError):
        await storage.create(document, b"different")
    updated = await storage.update(
        document.id, DocumentUpdate(name="New", asset_ids=[]), datetime.now(UTC)
    )
    assert updated.name == "New"
    assert updated.asset_ids == []
    assert updated.device_ids == ["boiler"]
    assert updated.filename == document.filename
    assert updated.updated_at > document.updated_at
    content = await storage.get_content(document.id)
    assert content is not None
    assert content.data == b"notice"
    await storage.delete(document.id)
    assert await storage.get_content(document.id) is None
    with pytest.raises(NotFoundError):
        await storage.delete(document.id)
    with pytest.raises(NotFoundError):
        await storage.update(
            document.id, DocumentUpdate(name="Gone"), datetime.now(UTC)
        )
    await storage.close()


async def test_folders_and_archives_follow_the_shared_rules():
    svc = DocumentsService(None)
    await svc.start()
    try:
        await check_folders_and_archives(svc)
    finally:
        await svc.stop()


async def test_subfolders_block_deletion_and_archive_dates_stick():
    svc = DocumentsService(None)
    await svc.start()
    try:
        await check_subfolders_block_deletion_and_archive_dates_stick(svc)
    finally:
        await svc.stop()


async def test_hidden_folders_are_read_only():
    svc = DocumentsService(None)
    await svc.start()
    try:
        await check_hidden_folders_are_read_only(svc)
    finally:
        await svc.stop()
