import contextlib
import os

import pytest

from documents import (
    DocumentAccess,
    DocumentCreate,
    DocumentFilters,
    DocumentsService,
    DocumentUpdate,
)
from documents.storage import build_storage
from models.errors import ConflictError, NotFoundError
from models.ids import gen_id
from models.pagination import PaginationParams

URL = os.environ.get("POSTGRES_TEST_URL")
pytestmark = [
    pytest.mark.asyncio,
    pytest.mark.integration,
    pytest.mark.skipif(URL is None, reason="POSTGRES_TEST_URL not set"),
]
ADMIN = DocumentAccess("admin", is_admin=True)


async def test_persistence_acl_pagination_and_partial_updates():
    svc = DocumentsService(URL)
    await svc.start()
    ids = []
    role = gen_id()
    reader = DocumentAccess(role)
    try:
        for index in range(3):
            document = await svc.create(
                DocumentCreate(
                    name=f"Notice {role} {index}",
                    allowed_role_ids=[role] if index else [],
                    asset_ids=[role],
                    device_ids=["boiler"],
                ),
                filename="été.txt",
                data=b"notice",
                created_by="author",
            )
            ids.append(document.id)
        await svc.stop()
        await svc.start()
        assert (await svc.get_content(ids[2], reader)).data == b"notice"
        with pytest.raises(NotFoundError):
            await svc.get(ids[0], reader)
        with pytest.raises(NotFoundError):
            await svc.get_content(ids[0], reader)
        first = await svc.list(
            reader,
            filters=DocumentFilters(q="NOTICE", asset_id=role, device_id="boiler"),
            pagination=PaginationParams(size=1),
        )
        second = await svc.list(reader, pagination=PaginationParams(page=2, size=1))
        assert first.total == second.total == 2
        assert first.items[0].id != second.items[0].id
        assert (
            await svc.list(reader, pagination=PaginationParams(page=9, size=1))
        ).total == 2
        assert await svc.has_role_reference(role)
        changed = await svc.update(
            ids[2], DocumentUpdate(name="Renamed", allowed_role_ids=[])
        )
        assert changed.asset_ids == [role]
        with pytest.raises(NotFoundError):
            await svc.get_content(ids[2], reader)
        assert (await svc.get_content(ids[2], ADMIN)).data == b"notice"
        storage = await build_storage(URL)
        try:
            with pytest.raises(ConflictError):
                await storage.create(changed, b"other")
        finally:
            await storage.close()
        await svc.delete(ids[1])
        assert not await svc.has_role_reference(role)
        with pytest.raises(NotFoundError):
            await svc.delete(ids[1])
        with pytest.raises(NotFoundError):
            await svc.update(ids[1], DocumentUpdate(name="Gone"))
    finally:
        for document_id in ids:
            with contextlib.suppress(NotFoundError):
                await svc.delete(document_id)
        await svc.stop()
