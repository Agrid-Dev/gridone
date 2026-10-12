from datetime import UTC, datetime

import pytest

from documents import DocumentAccess, DocumentFilters, DocumentUpdate
from documents.storage.memory import MemoryStorage
from models.errors import ConflictError, NotFoundError
from models.pagination import PaginationParams

pytestmark = pytest.mark.asyncio
ADMIN = DocumentAccess("admin", is_admin=True)
VIEWER = DocumentAccess("viewer")


async def test_visibility_filters_and_totals_before_pagination(document):
    storage = MemoryStorage()
    for index in range(4):
        await storage.create(
            document.model_copy(
                update={
                    "id": str(index),
                    "allowed_role_ids": ["viewer"] if index % 2 else [],
                }
            ),
            b"notice",
        )
    first = await storage.list(
        VIEWER,
        DocumentFilters(q="CHAUDIÈRE", asset_id="building", device_id="boiler"),
        PaginationParams(size=1),
    )
    second = await storage.list(
        VIEWER, DocumentFilters(), PaginationParams(page=2, size=1)
    )
    assert first.total == second.total == 2
    assert first.items[0].id != second.items[0].id
    assert (await storage.list(ADMIN, DocumentFilters(), PaginationParams())).total == 4
    for filters in [
        DocumentFilters(q="missing"),
        DocumentFilters(asset_id="other"),
        DocumentFilters(device_id="other"),
    ]:
        assert (await storage.list(VIEWER, filters, PaginationParams())).total == 0
    assert await storage.get("0", VIEWER) is None
    assert await storage.get_content("0", VIEWER) is None
    assert await storage.get("missing", ADMIN) is None


async def test_roundtrip_copies_partial_update_and_delete(document):
    storage = MemoryStorage()
    saved = await storage.create(document, b"notice")
    saved.allowed_role_ids.clear()
    read = await storage.get(document.id, VIEWER)
    assert read is not None
    assert read.allowed_role_ids == ["viewer"]
    content = await storage.get_content(document.id, VIEWER)
    assert content is not None
    assert content.data == b"notice"
    assert await storage.has_role_reference("viewer")
    with pytest.raises(ConflictError):
        await storage.create(document, b"different")
    updated = await storage.update(
        document.id, DocumentUpdate(name="New", allowed_role_ids=[]), datetime.now(UTC)
    )
    assert updated.asset_ids == ["building"]
    assert not await storage.has_role_reference("viewer")
    assert await storage.get_content(document.id, VIEWER) is None
    admin_content = await storage.get_content(document.id, ADMIN)
    assert admin_content is not None
    assert admin_content.data == b"notice"
    await storage.delete(document.id)
    with pytest.raises(NotFoundError):
        await storage.delete(document.id)
    with pytest.raises(NotFoundError):
        await storage.update(
            document.id, DocumentUpdate(name="Gone"), datetime.now(UTC)
        )
    await storage.close()
