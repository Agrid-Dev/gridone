"""Migrate actual legacy SQL rows and reload the new state from PostgreSQL."""

import os
from datetime import UTC, datetime
from unittest.mock import AsyncMock, MagicMock
from urllib.parse import urlsplit, urlunsplit

import asyncpg
import pytest
from automations.models import (
    Action,
    Automation,
    AutomationBranch,
    Deactivation,
    Trigger,
    TriggerContext,
)
from automations.service import AutomationsService
from automations.storage.postgres import MIGRATIONS_PATH, PostgresStorage
from yoyo import get_backend, read_migrations

from models.expressions import IsKnown
from models.ids import gen_id

POSTGRES_URL = os.environ.get("POSTGRES_TEST_URL")
LEGACY_ACTION = Action(
    provider_id="notification",
    params={"title": "Legacy", "body": "", "severity": "info", "user_ids": ["u1"]},
)
pytestmark = [
    pytest.mark.asyncio,
    pytest.mark.integration,
    pytest.mark.skipif(POSTGRES_URL is None, reason="POSTGRES_TEST_URL not set"),
]


async def test_legacy_row_migration_and_persistent_deactivation():
    assert POSTGRES_URL is not None
    admin = await asyncpg.connect(POSTGRES_URL)
    database = "automation_test_" + gen_id()
    await admin.execute(f'CREATE DATABASE "{database}"')
    parsed = urlsplit(POSTGRES_URL)
    url = urlunsplit(parsed._replace(path="/" + database))
    try:
        backend = get_backend(url)
        old = read_migrations(str(MIGRATIONS_PATH)).filter(
            lambda migration: not migration.id.startswith("0006.")
        )
        with backend.lock():
            backend.apply_migrations(backend.to_apply(old))
        connection = await asyncpg.connect(url)
        await connection.execute(
            """INSERT INTO automations
                (id, name, trigger, action, enabled, created_by)
                VALUES ('legacy', 'Legacy', $1::jsonb, $2::jsonb, FALSE, 'u1')""",
            '{"provider_id":"schedule","params":{"cron":"0 * * * *"}}',
            '{"provider_id":"notification","params":{"title":"Legacy",'
            '"body":"","severity":"info","user_ids":["u1"]}}',
        )
        await connection.close()
        storage = await PostgresStorage.from_url(url)
        await storage.start()
        migrated = await storage.get("legacy")
        assert len(migrated.branches) == 1
        assert migrated.branches[0].action == LEGACY_ACTION
        assert migrated.branches[0].condition is None
        assert not migrated.enabled
        assert "action" not in await _columns(url)
        disabled = migrated.model_copy(
            update={
                "deactivation": Deactivation(
                    reason="Maintenance", actor_id="u1", at=datetime.now(UTC)
                )
            }
        )
        await storage.update(disabled)
        await storage.close()
        reloaded = await PostgresStorage.from_url(url)
        try:
            assert await reloaded.get("legacy") == disabled
        finally:
            await reloaded.close()
        await _assert_service_resumes_legacy(url, migrated, disabled.deactivation)
    finally:
        await admin.execute(f'DROP DATABASE "{database}" WITH (FORCE)')
        await admin.close()


async def _columns(url: str) -> set[str]:
    connection = await asyncpg.connect(url)
    try:
        rows = await connection.fetch(
            "SELECT column_name FROM information_schema.columns"
            " WHERE table_name = 'automations'"
        )
    finally:
        await connection.close()
    return {row["column_name"] for row in rows}


async def test_rollback_rebuilds_the_action_column_and_refuses_trees():
    """An older binary reads `action`; a tree has no such representation."""
    assert POSTGRES_URL is not None
    admin = await asyncpg.connect(POSTGRES_URL)
    database = "automation_test_" + gen_id()
    await admin.execute(f'CREATE DATABASE "{database}"')
    parsed = urlsplit(POSTGRES_URL)
    url = urlunsplit(parsed._replace(path="/" + database))
    try:
        storage = await PostgresStorage.from_url(url)
        await storage.start()
        single = Automation(
            id="single",
            name="Single",
            trigger=Trigger(provider_id="schedule", params={"cron": "0 * * * *"}),
            branches=[AutomationBranch(action=LEGACY_ACTION)],
        )
        await storage.create(single)
        await storage.close()
        backend = get_backend(url)
        tree_migration = read_migrations(str(MIGRATIONS_PATH)).filter(
            lambda migration: migration.id.startswith("0006.")
        )
        with backend.lock():
            backend.rollback_migrations(backend.to_rollback(tree_migration))
        connection = await asyncpg.connect(url)
        try:
            row = await connection.fetchrow(
                "SELECT action FROM automations WHERE id = 'single'"
            )
        finally:
            await connection.close()
        assert row is not None
        assert Action.model_validate_json(row["action"]) == LEGACY_ACTION
        assert "branches" not in await _columns(url)
        with backend.lock():
            backend.apply_migrations(backend.to_apply(tree_migration))
        storage = await PostgresStorage.from_url(url)
        await storage.create(
            single.model_copy(
                update={
                    "id": "tree",
                    "branches": [
                        AutomationBranch(
                            action=LEGACY_ACTION,
                            condition=IsKnown(op="is_known", value=True),
                        ),
                        AutomationBranch(action=LEGACY_ACTION),
                    ],
                }
            )
        )
        await storage.close()
        with pytest.raises(Exception, match="Cannot roll back"), backend.lock():
            backend.rollback_migrations(backend.to_rollback(tree_migration))
    finally:
        await admin.execute(f'DROP DATABASE "{database}" WITH (FORCE)')
        await admin.close()


async def _assert_service_resumes_legacy(
    url: str, migrated: Automation, deactivation: Deactivation | None
) -> None:
    trigger = MagicMock(
        id="schedule",
        register=AsyncMock(return_value="handle"),
        unregister=AsyncMock(),
    )
    action = MagicMock(
        id="notification", execute=AsyncMock(return_value="notification-id")
    )
    legacy = migrated.branches[0].action
    assert legacy is not None
    service = AutomationsService(url, [trigger], [action])
    await service.start()
    try:
        assert (await service.get("legacy")).deactivation == deactivation
        trigger.register.assert_not_awaited()
        await service.enable("legacy")
        action.execute.assert_not_awaited()
        context = TriggerContext(timestamp=datetime.now(UTC))
        await service._make_on_fire("legacy")(context)  # noqa: SLF001
        action.execute.assert_awaited_once_with(legacy.params, context)
        executions = await service.list_executions("legacy")
        assert executions[0].context == context
        assert executions[0].branch_id == migrated.branches[0].id
        assert executions[0].branches[0].result == "matched"
    finally:
        await service.stop()
