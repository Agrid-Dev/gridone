import os
from datetime import UTC, datetime

import pytest

from models.errors import ConflictError
from models.protections import ProtectionRetirement
from protections.service import ProtectionsService
from protections.storage import build_storage

POSTGRES_URL = os.environ.get("POSTGRES_TEST_URL")
pytestmark = [
    pytest.mark.asyncio,
    pytest.mark.integration,
    pytest.mark.skipif(POSTGRES_URL is None, reason="POSTGRES_TEST_URL not set"),
]


async def test_migrate_restart_and_audit_history(definition, inspector):
    service = ProtectionsService(POSTGRES_URL, inspector)
    await service.start()
    created = await service.create(definition, "admin")
    updated = await service.update(
        created.id, definition.model_copy(update={"name": "Updated"}), "editor", 1
    )
    retirement = ProtectionRetirement(
        reason="Wiring replaced", actor_id="admin", retired_at=datetime.now(UTC)
    )
    retired = await service.retire(created.id, retirement, 2)
    await service.stop()
    await service.stop()
    restarted = ProtectionsService(POSTGRES_URL, inspector)
    await restarted.start()
    try:
        assert restarted.get(created.id) == retired
        assert await restarted.history(created.id) == [created, updated, retired]
        assert all(
            rule.id != created.id for rule in restarted.for_target("a", "command")
        )
    finally:
        await restarted.stop()


async def test_database_rejects_duplicate_and_skipped_revisions(definition, inspector):
    service = ProtectionsService(POSTGRES_URL, inspector)
    await service.start()
    created = await service.create(definition, "admin")
    storage = await build_storage(POSTGRES_URL)
    try:
        with pytest.raises(ConflictError):
            await storage.save(created)
        with pytest.raises(ConflictError):
            await storage.save(created.model_copy(update={"revision": 3}))
        second = created.model_copy(update={"revision": 2, "name": "Changed"})
        assert await storage.save(second) == second
        with pytest.raises(ConflictError):
            await storage.save(second.model_copy(update={"name": "Stale"}))
        assert await storage.history(created.id) == [created, second]
    finally:
        await storage.close()
        await service.stop()
