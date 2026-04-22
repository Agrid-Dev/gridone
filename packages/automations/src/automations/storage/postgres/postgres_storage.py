from __future__ import annotations

import json

import asyncpg
from pydantic import TypeAdapter

from automations.models import (
    Automation,
    AutomationExecution,
    ExecutionStatus,
    Trigger,
)
from models.errors import NotFoundError

_trigger_adapter: TypeAdapter[Trigger] = TypeAdapter(Trigger)


class PostgresStorage:
    def __init__(self, pool: asyncpg.Pool, dsn: str) -> None:
        self._pool = pool
        self._dsn = dsn

    @classmethod
    async def from_url(cls, url: str) -> PostgresStorage:
        pool = await asyncpg.create_pool(url, min_size=1, max_size=3)
        return cls(pool, dsn=url)

    @staticmethod
    def _row_to_automation(row: asyncpg.Record) -> Automation:
        trigger = _trigger_adapter.validate_python(json.loads(row["trigger"]))
        return Automation(
            id=row["id"],
            name=row["name"],
            trigger=trigger,
            action_template_id=row["action_template_id"],
            enabled=row["enabled"],
        )

    @staticmethod
    def _row_to_execution(row: asyncpg.Record) -> AutomationExecution:
        return AutomationExecution(
            id=row["id"],
            automation_id=row["automation_id"],
            triggered_at=row["triggered_at"],
            executed_at=row["executed_at"],
            status=ExecutionStatus(row["status"]),
            error=row["error"],
            output_id=row["output_id"],
        )

    async def create(self, automation: Automation) -> None:
        await self._pool.execute(
            """
            INSERT INTO automations (id, name, trigger, action_template_id, enabled)
            VALUES ($1, $2, $3, $4, $5)
            """,
            automation.id,
            automation.name,
            _trigger_adapter.dump_json(automation.trigger).decode(),
            automation.action_template_id,
            automation.enabled,
        )

    async def get(self, automation_id: str) -> Automation:
        row = await self._pool.fetchrow(
            "SELECT * FROM automations WHERE id = $1",
            automation_id,
        )
        if row is None:
            msg = f"Automation {automation_id!r} not found"
            raise NotFoundError(msg)
        return self._row_to_automation(row)

    async def list(self, *, enabled: bool | None = None) -> list[Automation]:  # type: ignore[invalid-type-form]
        if enabled is None:
            rows = await self._pool.fetch("SELECT * FROM automations")
        else:
            rows = await self._pool.fetch(
                "SELECT * FROM automations WHERE enabled = $1", enabled
            )
        return [self._row_to_automation(r) for r in rows]

    async def update(self, automation: Automation) -> None:
        result = await self._pool.execute(
            """
            UPDATE automations
            SET name = $2, trigger = $3, action_template_id = $4, enabled = $5
            WHERE id = $1
            """,
            automation.id,
            automation.name,
            _trigger_adapter.dump_json(automation.trigger).decode(),
            automation.action_template_id,
            automation.enabled,
        )
        if result == "UPDATE 0":
            msg = f"Automation {automation.id!r} not found"
            raise NotFoundError(msg)

    async def delete(self, automation_id: str) -> None:
        result = await self._pool.execute(
            "DELETE FROM automations WHERE id = $1",
            automation_id,
        )
        if result == "DELETE 0":
            msg = f"Automation {automation_id!r} not found"
            raise NotFoundError(msg)

    async def log_execution(self, execution: AutomationExecution) -> None:
        await self._pool.execute(
            """
            INSERT INTO automation_executions
                (id, automation_id, triggered_at, executed_at, status, error, output_id)
            VALUES ($1, $2, $3, $4, $5, $6, $7)
            """,
            execution.id,
            execution.automation_id,
            execution.triggered_at,
            execution.executed_at,
            execution.status.value,
            execution.error,
            execution.output_id,
        )

    async def list_executions(self, automation_id: str) -> list[AutomationExecution]:  # type: ignore[invalid-type-form]
        rows = await self._pool.fetch(
            """
            SELECT * FROM automation_executions
            WHERE automation_id = $1
            ORDER BY triggered_at DESC
            """,
            automation_id,
        )
        return [self._row_to_execution(r) for r in rows]

    async def start(self) -> None:
        from automations.storage.postgres import run_migrations  # noqa: PLC0415

        run_migrations(self._dsn)

    async def close(self) -> None:
        await self._pool.close()
