"""Group records are atomic; local database constraints enforce membership."""

from __future__ import annotations

from typing import TYPE_CHECKING

from devices_manager.core.device_group import DeviceGroup
from models.errors import ConflictError

from .postgres_storage import PostgresStorageBackend

if TYPE_CHECKING:
    import asyncpg


class PostgresGroupStorage(PostgresStorageBackend[DeviceGroup]):
    def __init__(self, pool: asyncpg.Pool) -> None:
        super().__init__("dm_device_groups", pool, DeviceGroup.model_validate)

    async def write(self, item_id: str, data: DeviceGroup) -> None:
        await self._pool.execute(
            "INSERT INTO dm_device_groups (id, data) VALUES ($1, $2) "
            "ON CONFLICT (id) DO UPDATE SET data = EXCLUDED.data",
            item_id,
            data.model_dump(mode="json"),
        )

    async def compare_and_swap(
        self, item_id: str, data: DeviceGroup, expected: DeviceGroup | None
    ) -> None:
        """Compare timestamps as instants: database cleanup uses offset ISO strings."""
        if expected is None:
            result = await self._pool.execute(
                "INSERT INTO dm_device_groups (id, data) VALUES ($1, $2) "
                "ON CONFLICT (id) DO NOTHING",
                item_id,
                data.model_dump(mode="json"),
            )
        else:
            result = await self._pool.execute(
                "UPDATE dm_device_groups SET data=$2 WHERE id=$1 "
                "AND data - '{created_at,updated_at}'::text[] = "
                "$3::jsonb - '{created_at,updated_at}'::text[] "
                "AND (data->>'created_at')::timestamptz = "
                "($3::jsonb->>'created_at')::timestamptz "
                "AND (data->>'updated_at')::timestamptz = "
                "($3::jsonb->>'updated_at')::timestamptz",
                item_id,
                data.model_dump(mode="json"),
                expected.model_dump(mode="json"),
            )
        if self._affected_rows(result) != 1:
            msg = "Device group changed during update"
            raise ConflictError(msg)
