from datetime import UTC, datetime
from unittest.mock import AsyncMock, Mock

import pytest

from models.errors import ConflictError, StorageConnectionError, UnsupportedStorageError
from models.operating_rules import OperatingRule
from operating_rules.service import OperatingRulesService
from operating_rules.storage import build_storage
from operating_rules.storage.yaml import YamlStorage

pytestmark = pytest.mark.asyncio


@pytest.mark.parametrize("persistent", [False, True])
async def test_revision_roundtrip_and_restart(definition, tmp_path, persistent):
    url = f"yaml:{tmp_path}" if persistent else None
    storage = await build_storage(url)
    now = datetime.now(UTC)
    rule = OperatingRule(
        **definition.model_dump(),
        id="rule",
        points=[],
        created_at=now,
        updated_at=now,
        created_by="admin",
        updated_by="admin",
    )
    assert await storage.list_operating_rules() == []
    assert await storage.history("missing") == []
    saved = await storage.save(rule)
    saved.points.clear()
    second = rule.model_copy(
        update={"revision": 2, "name": "Changed", "max_age_seconds": 120}
    )
    await storage.save(second)
    with pytest.raises(ConflictError):
        await storage.save(second)
    assert await storage.list_operating_rules() == [second]
    assert await storage.history(rule.id) == [rule, second]
    await storage.close()
    if persistent:
        reopened = await build_storage(url)
        assert await reopened.history(rule.id) == [rule, second]
        await reopened.close()


async def test_bad_backend_and_corrupt_ledger(tmp_path):
    with pytest.raises(UnsupportedStorageError):
        await build_storage("unsupported:store")
    (tmp_path / "operating_rules.json").write_text("not valid json")
    with pytest.raises(StorageConnectionError):
        await build_storage(f"yaml:{tmp_path}")


async def test_disabled_and_deleted_rules_survive_restart(
    definition, inspector, tmp_path
):
    url = f"yaml:{tmp_path}"
    service = OperatingRulesService(url, inspector)
    await service.start()
    disabled = await service.create(definition, "admin")
    deleted = await service.create(definition, "admin")
    await service.set_enabled(disabled.id, "admin", 1, enabled=False)
    await service.delete(deleted.id, "admin", 1)
    await service.stop()
    await service.start()
    try:
        assert service.for_target("a", "command") == []
        assert [row.operating_rule.id for row in service.list_operating_rules()] == [
            disabled.id
        ]
        assert not service.get(disabled.id).enabled
        assert (await service.history(deleted.id))[-1].deleted_at is not None
    finally:
        await service.stop()


async def test_database_connection_failure(monkeypatch):
    monkeypatch.setattr(
        "operating_rules.storage.postgres.build_postgres_storage",
        AsyncMock(side_effect=OSError("private")),
    )
    with pytest.raises(StorageConnectionError, match="Failed to initialize"):
        await build_storage("postgresql://missing")


async def test_failed_file_replacement_preserves_previous_revision(
    definition, tmp_path, monkeypatch
):
    storage = YamlStorage(str(tmp_path))
    now = datetime.now(UTC)
    rule = OperatingRule(
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
    assert list(tmp_path.iterdir()) == [tmp_path / "operating_rules.json"]
