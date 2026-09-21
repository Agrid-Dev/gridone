from datetime import UTC, datetime
from unittest.mock import AsyncMock, Mock

import pytest

from models.errors import ConflictError, StorageConnectionError, UnsupportedStorageError
from models.protections import Protection
from protections.storage import build_storage
from protections.storage.yaml import YamlStorage

pytestmark = pytest.mark.asyncio


@pytest.mark.parametrize("persistent", [False, True])
async def test_revision_roundtrip_and_restart(definition, tmp_path, persistent):
    url = f"yaml:{tmp_path}" if persistent else None
    storage = await build_storage(url)
    now = datetime.now(UTC)
    rule = Protection(
        **definition.model_dump(),
        id="rule",
        points=[],
        created_at=now,
        updated_at=now,
        created_by="admin",
        updated_by="admin",
    )
    assert await storage.list_protections() == []
    assert await storage.history("missing") == []
    saved = await storage.save(rule)
    saved.points.clear()
    second = rule.model_copy(update={"revision": 2, "name": "Changed"})
    await storage.save(second)
    with pytest.raises(ConflictError):
        await storage.save(second)
    assert await storage.list_protections() == [second]
    assert await storage.history(rule.id) == [rule, second]
    await storage.close()
    if persistent:
        reopened = await build_storage(url)
        assert await reopened.history(rule.id) == [rule, second]
        await reopened.close()


async def test_bad_backend_and_corrupt_ledger(tmp_path):
    with pytest.raises(UnsupportedStorageError):
        await build_storage("unsupported:store")
    (tmp_path / "protections.json").write_text("not valid json")
    with pytest.raises(StorageConnectionError):
        await build_storage(f"yaml:{tmp_path}")


async def test_database_connection_failure(monkeypatch):
    monkeypatch.setattr(
        "protections.storage.postgres.build_postgres_storage",
        AsyncMock(side_effect=OSError("private")),
    )
    with pytest.raises(StorageConnectionError, match="Failed to initialize"):
        await build_storage("postgresql://missing")


async def test_failed_file_replacement_preserves_previous_revision(
    definition, tmp_path, monkeypatch
):
    storage = YamlStorage(str(tmp_path))
    now = datetime.now(UTC)
    rule = Protection(
        **definition.model_dump(),
        id="rule",
        points=[],
        created_at=now,
        updated_at=now,
        created_by="admin",
        updated_by="admin",
    )
    await storage.save(rule)
    monkeypatch.setattr(storage, "_replace", Mock(side_effect=OSError("disk failure")))
    with pytest.raises(OSError, match="disk failure"):
        await storage.save(rule.model_copy(update={"revision": 2, "name": "Changed"}))
    assert await storage.history(rule.id) == [rule]
    assert await YamlStorage(str(tmp_path)).history(rule.id) == [rule]
    assert list(tmp_path.iterdir()) == [tmp_path / "protections.json"]
