import contextlib
import os
from pathlib import Path

import asyncpg
import pytest

from documents import DocumentCreate, DocumentFilters, DocumentsService, DocumentUpdate
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


async def test_persistence_search_pagination_and_rename():
    svc = DocumentsService(URL)
    await svc.start()
    ids = []
    suffix = gen_id()
    filters = DocumentFilters(q=f"NOTICE {suffix}", asset_id=suffix, device_id="boiler")
    try:
        for index in range(3):
            document = await svc.create(
                DocumentCreate(
                    name=f"Notice {suffix} {index}",
                    asset_ids=[suffix],
                    device_ids=["boiler"],
                ),
                filename="été.txt",
                data=b"notice",
                created_by="author",
            )
            ids.append(document.id)
        await svc.stop()
        await svc.start()
        assert (await svc.get_content(ids[2])).data == b"notice"
        first = await svc.list(filters=filters, pagination=PaginationParams(size=1))
        second = await svc.list(
            filters=filters, pagination=PaginationParams(page=2, size=1)
        )
        assert first.total == second.total == 3
        assert first.items[0].id != second.items[0].id
        beyond = await svc.list(
            filters=filters, pagination=PaginationParams(page=9, size=1)
        )
        assert beyond.total == 3
        assert beyond.items == []
        changed = await svc.update(
            ids[2], DocumentUpdate(name="Renamed", device_ids=[])
        )
        assert changed.name == "Renamed"
        assert changed.filename == "été.txt"
        assert changed.asset_ids == [suffix]
        assert changed.device_ids == []
        assert (await svc.get_content(ids[2])).data == b"notice"
        assert (await svc.list(filters=filters)).total == 2
        assert "content" not in (await svc.get(ids[2])).model_dump()
        storage = await build_storage(URL)
        try:
            with pytest.raises(ConflictError):
                await storage.create(changed, b"other")
        finally:
            await storage.close()
        await svc.delete(ids[1])
        with pytest.raises(NotFoundError):
            await svc.delete(ids[1])
        with pytest.raises(NotFoundError):
            await svc.update(ids[1], DocumentUpdate(name="Gone"))
        with pytest.raises(NotFoundError):
            await svc.get(ids[1])
        with pytest.raises(NotFoundError):
            await svc.get_content(ids[1])
    finally:
        for document_id in ids:
            with contextlib.suppress(NotFoundError):
                await svc.delete(document_id)
        await svc.stop()


async def test_upgrade_from_early_sharing_schema_preserves_files_and_links():
    svc = DocumentsService(URL)
    await svc.start()
    document = await svc.create(
        DocumentCreate(
            name="Legacy upload", asset_ids=["building"], device_ids=["boiler"]
        ),
        filename="legacy.txt",
        data=b"original bytes",
        created_by="author",
    )
    await svc.stop()
    connection = await asyncpg.connect(URL)
    try:
        await connection.execute(
            "ALTER TABLE documents ADD COLUMN allowed_role_ids "
            "TEXT[] NOT NULL DEFAULT '{}'"
        )
        await connection.execute(
            "CREATE INDEX documents_roles_idx ON documents USING GIN (allowed_role_ids)"
        )
        migration = (
            Path(__file__).parents[2]
            / "src/documents/storage/postgres/migrations"
            / "0002.documents-remove-sharing.sql"
        )
        await connection.execute(migration.read_text())
        # The upgrade is also safe when applied to a fresh schema.
        await connection.execute(migration.read_text())
        await svc.start()
        saved = await svc.get(document.id)
        assert saved.asset_ids == ["building"]
        assert saved.device_ids == ["boiler"]
        assert (await svc.get_content(document.id)).data == b"original bytes"
        created = await svc.create(
            DocumentCreate(name="After upgrade"),
            filename="new.txt",
            data=b"new bytes",
            created_by="author",
        )
        await svc.delete(created.id)
    finally:
        await connection.execute(
            "ALTER TABLE documents DROP COLUMN IF EXISTS allowed_role_ids"
        )
        await connection.close()
        await svc.start()
        await svc.delete(document.id)
        await svc.stop()
