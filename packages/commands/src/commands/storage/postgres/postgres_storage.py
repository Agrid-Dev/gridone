from __future__ import annotations

import logging
from typing import TYPE_CHECKING

from commands.models import Command, CommandStatus
from commands.storage.postgres.deserialize import deserialize_command_value
from models.errors import NotFoundError
from models.types import DataType, SortOrder

if TYPE_CHECKING:
    from datetime import datetime

    import asyncpg

    from commands.filters import CommandsQueryFilters
    from commands.models import CommandCreate

logger = logging.getLogger(__name__)


class PostgresCommandsStorage:
    def __init__(self, pool: asyncpg.Pool) -> None:
        self._pool = pool

    def _row_to_command(self, row: asyncpg.Record) -> Command:
        return Command(
            id=row["id"],
            group_id=row["group_id"],
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

    async def save_command(self, command: CommandCreate) -> Command:
        row = await self._pool.fetchrow(
            """
            INSERT INTO commands
                (group_id, device_id, attribute, value, data_type,
                 status, status_details, user_id, created_at,
                 executed_at, completed_at)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
            RETURNING *
            """,
            command.group_id,
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

    async def save_commands(self, commands: list[CommandCreate]) -> list[Command]:
        result = []
        async with self._pool.acquire() as conn, conn.transaction():
            for cmd in commands:
                row = await conn.fetchrow(
                    """
                    INSERT INTO commands
                        (group_id, device_id, attribute, value, data_type,
                         status, status_details, user_id, created_at,
                         executed_at, completed_at)
                    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
                    RETURNING *
                    """,
                    cmd.group_id,
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
    ) -> Command:
        row = await self._pool.fetchrow(
            """
            UPDATE commands
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

        if filters.group_id is not None:
            clauses.append(f"group_id = ${idx}")
            params.append(filters.group_id)
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
    ) -> list[Command]:
        where, params = self._build_where(filters)
        idx = len(params) + 1

        order = sort.value
        query = f"SELECT * FROM commands{where} ORDER BY created_at {order}"  # noqa: S608
        if limit is not None:
            query += f" LIMIT ${idx}"
            params.append(limit)
            idx += 1
        if offset is not None:
            query += f" OFFSET ${idx}"
            params.append(offset)

        rows = await self._pool.fetch(query, *params)
        return [self._row_to_command(r) for r in rows]

    async def get_commands_by_ids(self, ids: list[int]) -> list[Command]:
        if not ids:
            return []
        rows = await self._pool.fetch("SELECT * FROM commands WHERE id = ANY($1)", ids)
        return [self._row_to_command(r) for r in rows]

    async def count_commands(self, filters: CommandsQueryFilters) -> int:
        where, params = self._build_where(filters)
        query = f"SELECT COUNT(*) FROM commands{where}"  # noqa: S608
        return await self._pool.fetchval(query, *params)

    async def close(self) -> None:
        await self._pool.close()
