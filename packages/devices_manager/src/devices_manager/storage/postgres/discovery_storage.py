from __future__ import annotations

from typing import TYPE_CHECKING

from devices_manager.core.discovery_manager import DiscoveryConfig

if TYPE_CHECKING:
    import asyncpg


class PostgresDiscoveryStorage:
    """``DiscoveryStorage`` port over the dm_discoveries table."""

    def __init__(self, pool: asyncpg.Pool) -> None:
        self._pool = pool

    async def read_all(self) -> list[DiscoveryConfig]:
        rows = await self._pool.fetch(
            "SELECT driver_id, transport_id FROM dm_discoveries "
            "ORDER BY transport_id, driver_id",
        )
        return [
            DiscoveryConfig(
                driver_id=row["driver_id"], transport_id=row["transport_id"]
            )
            for row in rows
        ]

    async def write(self, config: DiscoveryConfig) -> None:
        await self._pool.execute(
            "INSERT INTO dm_discoveries (driver_id, transport_id) VALUES ($1, $2) "
            "ON CONFLICT DO NOTHING",
            config["driver_id"],
            config["transport_id"],
        )

    async def delete(self, config: DiscoveryConfig) -> None:
        await self._pool.execute(
            "DELETE FROM dm_discoveries WHERE driver_id = $1 AND transport_id = $2",
            config["driver_id"],
            config["transport_id"],
        )
