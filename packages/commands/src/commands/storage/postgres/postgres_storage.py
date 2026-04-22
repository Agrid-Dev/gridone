from __future__ import annotations

import logging
from typing import TYPE_CHECKING, Any

from commands.models import (
    AttributeWrite,
    CommandStatus,
    CommandTemplate,
    UnitCommand,
)
from commands.storage.postgres.deserialize import deserialize_command_value
from models.errors import NotFoundError
from models.types import DataType, SortOrder

if TYPE_CHECKING:
    from datetime import datetime

    import asyncpg

    from commands.filters import CommandsQueryFilters
    from commands.models import UnitCommandCreate

logger = logging.getLogger(__name__)


def _write_to_jsonb(write: AttributeWrite) -> dict[str, Any]:
    return {
        "attribute": write.attribute,
        "value": write.value,
        "data_type": write.data_type.value,
    }


def _write_from_jsonb(raw: dict[str, Any]) -> AttributeWrite:
    return AttributeWrite(
        attribute=raw["attribute"],
        value=raw["value"],
        data_type=DataType(raw["data_type"]),
    )


class PostgresCommandsStorage:
    def __init__(self, pool: asyncpg.Pool) -> None:
        self._pool = pool

    # -- unit commands --

    def _row_to_command(self, row: asyncpg.Record) -> UnitCommand:
        return UnitCommand(
            id=row["id"],
            batch_id=row["batch_id"],
            template_id=row["template_id"],
            device_id=row["device_id"],
            attribute=row["attribute"],
            value=deserialize_command_value(row["value"], DataType(row["data_type"])),
            data_type=DataType(row["data_type"]),
            status=CommandStatus(row["status"]),
            status_details=row["status_details"],
            user_id=row["user_id"],
            created_at=row["created_at"],
            executed_at=row["executed_at"],
            completed_at=row["completed_at"],
        )

    async def save_command(self, command: UnitCommandCreate) -> UnitCommand:
        row = await self._pool.fetchrow(
            """
            INSERT INTO unit_commands
                (batch_id, template_id, device_id, attribute, value, data_type,
                 status, status_details, user_id, created_at,
                 executed_at, completed_at)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
            RETURNING *
            """,
            command.batch_id,
            command.template_id,
            command.device_id,
            command.attribute,
            str(command.value),
            command.data_type.value,
            command.status.value,
            command.status_details,
            command.user_id,
            command.created_at,
            command.executed_at,
            command.completed_at,
        )
        return self._row_to_command(row)

    async def save_commands(
        self, commands: list[UnitCommandCreate]
    ) -> list[UnitCommand]:
        result = []
        async with self._pool.acquire() as conn, conn.transaction():
            for cmd in commands:
                row = await conn.fetchrow(
                    """
                    INSERT INTO unit_commands
                        (batch_id, template_id, device_id, attribute, value, data_type,
                         status, status_details, user_id, created_at,
                         executed_at, completed_at)
                    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
                    RETURNING *
                    """,
                    cmd.batch_id,
                    cmd.template_id,
                    cmd.device_id,
                    cmd.attribute,
                    str(cmd.value),
                    cmd.data_type.value,
                    cmd.status.value,
                    cmd.status_details,
                    cmd.user_id,
                    cmd.created_at,
                    cmd.executed_at,
                    cmd.completed_at,
                )
                result.append(self._row_to_command(row))
        return result

    async def update_command_status(
        self,
        command_id: int,
        status: CommandStatus,
        *,
        status_details: str | None = None,
        completed_at: datetime | None = None,
    ) -> UnitCommand:
        row = await self._pool.fetchrow(
            """
            UPDATE unit_commands
            SET status = $1, status_details = $2, completed_at = $3
            WHERE id = $4
            RETURNING *
            """,
            status.value,
            status_details,
            completed_at,
            command_id,
        )
        if row is None:
            msg = f"Command {command_id} not found"
            raise NotFoundError(msg)
        return self._row_to_command(row)

    def _build_where(self, filters: CommandsQueryFilters) -> tuple[str, list[object]]:
        clauses: list[str] = []
        params: list[object] = []
        idx = 1

        if filters.batch_id is not None:
            clauses.append(f"batch_id = ${idx}")
            params.append(filters.batch_id)
            idx += 1
        if filters.device_id is not None:
            clauses.append(f"device_id = ${idx}")
            params.append(filters.device_id)
            idx += 1
        if filters.attribute is not None:
            clauses.append(f"attribute = ${idx}")
            params.append(filters.attribute)
            idx += 1
        if filters.user_id is not None:
            clauses.append(f"user_id = ${idx}")
            params.append(filters.user_id)
            idx += 1
        if filters.start is not None:
            clauses.append(f"created_at >= ${idx}")
            params.append(filters.start)
            idx += 1
        if filters.end is not None:
            clauses.append(f"created_at < ${idx}")
            params.append(filters.end)

        where = ""
        if clauses:
            where = " WHERE " + " AND ".join(clauses)
        return where, params

    async def get_commands(
        self,
        filters: CommandsQueryFilters,
        *,
        sort: SortOrder = SortOrder.ASC,
        limit: int | None = None,
        offset: int | None = None,
    ) -> list[UnitCommand]:
        where, params = self._build_where(filters)
        idx = len(params) + 1

        order = sort.value
        query = f"SELECT * FROM unit_commands{where} ORDER BY created_at {order}"  # noqa: S608
        if limit is not None:
            query += f" LIMIT ${idx}"
            params.append(limit)
            idx += 1
        if offset is not None:
            query += f" OFFSET ${idx}"
            params.append(offset)

        rows = await self._pool.fetch(query, *params)
        return [self._row_to_command(r) for r in rows]

    async def get_commands_by_ids(self, ids: list[int]) -> list[UnitCommand]:
        if not ids:
            return []
        rows = await self._pool.fetch(
            "SELECT * FROM unit_commands WHERE id = ANY($1)", ids
        )
        return [self._row_to_command(r) for r in rows]

    async def count_commands(self, filters: CommandsQueryFilters) -> int:
        where, params = self._build_where(filters)
        query = f"SELECT COUNT(*) FROM unit_commands{where}"  # noqa: S608
        return await self._pool.fetchval(query, *params)

    # -- command templates --

    def _row_to_template(self, row: asyncpg.Record) -> CommandTemplate:
        return CommandTemplate(
            id=row["id"],
            name=row["name"],
            target=row["target"],
            write=_write_from_jsonb(row["write"]),
            created_at=row["created_at"],
            created_by=row["created_by"],
        )

    async def save_template(self, template: CommandTemplate) -> CommandTemplate:
        row = await self._pool.fetchrow(
            """
            INSERT INTO command_templates
                (id, name, target, write, created_at, created_by)
            VALUES ($1, $2, $3, $4, $5, $6)
            RETURNING *
            """,
            template.id,
            template.name,
            dict(template.target),
            _write_to_jsonb(template.write),
            template.created_at,
            template.created_by,
        )
        return self._row_to_template(row)

    async def get_template(self, template_id: str) -> CommandTemplate | None:
        row = await self._pool.fetchrow(
            "SELECT * FROM command_templates WHERE id = $1",
            template_id,
        )
        if row is None:
            return None
        return self._row_to_template(row)

    async def list_templates(
        self, *, limit: int | None = None, offset: int | None = None
    ) -> list[CommandTemplate]:
        query = (
            "SELECT * FROM command_templates WHERE name IS NOT NULL ORDER BY created_at"
        )
        params: list[object] = []
        idx = 1
        if limit is not None:
            query += f" LIMIT ${idx}"
            params.append(limit)
            idx += 1
        if offset is not None:
            query += f" OFFSET ${idx}"
            params.append(offset)
        rows = await self._pool.fetch(query, *params)
        return [self._row_to_template(r) for r in rows]

    async def count_templates(self) -> int:
        return await self._pool.fetchval(
            "SELECT COUNT(*) FROM command_templates WHERE name IS NOT NULL"
        )

    async def delete_template(self, template_id: str) -> None:
        """Demote a template to ephemeral by nulling its ``name``.

        The row itself survives so historical unit commands keep their
        ``template_id`` pointer — a later cleanup job reaps old ephemeral
        rows and the ``ON DELETE SET NULL`` cascade detaches the history
        at that point.
        """
        await self._pool.execute(
            "UPDATE command_templates SET name = NULL WHERE id = $1",
            template_id,
        )

    async def close(self) -> None:
        await self._pool.close()
