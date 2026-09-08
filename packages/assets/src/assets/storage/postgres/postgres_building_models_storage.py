import json
from datetime import datetime

import asyncpg

from assets.storage.models import BuildingModelInDB


class PostgresBuildingModelsStorage:
    """PostgreSQL-backed storage for building 3D models (bytea payloads)."""

    _pool: asyncpg.Pool

    def __init__(self, pool: asyncpg.Pool) -> None:
        self._pool = pool

    def _row_to_meta(self, row: asyncpg.Record) -> BuildingModelInDB:
        return BuildingModelInDB(
            asset_id=row["asset_id"],
            status=row["status"],
            filename=row["filename"],
            error=row["error"],
            ifc_size=row["ifc_size"] or 0,
            glb_size=row["glb_size"],
            storeys=json.loads(row["storeys"]),
            spaces=json.loads(row["spaces"]),
            converter_version=row["converter_version"] or 0,
            created_at=row["created_at"],
            updated_at=row["updated_at"],
        )

    async def get(self, asset_id: str) -> BuildingModelInDB | None:
        row = await self._pool.fetchrow(
            """
            SELECT asset_id, status, filename, error,
                   octet_length(ifc_data) AS ifc_size,
                   octet_length(glb_data) AS glb_size,
                   storeys, spaces, converter_version, created_at, updated_at
            FROM building_models WHERE asset_id = $1
            """,
            asset_id,
        )
        return self._row_to_meta(row) if row else None

    async def save(self, model: BuildingModelInDB, ifc_data: bytes) -> None:
        await self._pool.execute(
            """
            INSERT INTO building_models
                (asset_id, status, filename, error, ifc_data, glb_data,
                 storeys, spaces, created_at, updated_at)
            VALUES ($1, $2, $3, $4, $5, NULL, '[]'::jsonb, '[]'::jsonb, $6, $7)
            ON CONFLICT (asset_id) DO UPDATE SET
                status = EXCLUDED.status,
                filename = EXCLUDED.filename,
                error = EXCLUDED.error,
                ifc_data = EXCLUDED.ifc_data,
                glb_data = NULL,
                storeys = '[]'::jsonb,
                spaces = '[]'::jsonb,
                created_at = EXCLUDED.created_at,
                updated_at = EXCLUDED.updated_at
            """,
            model.asset_id,
            model.status,
            model.filename,
            model.error,
            ifc_data,
            model.created_at,
            model.updated_at,
        )

    async def set_result(
        self, model: BuildingModelInDB, glb_data: bytes | None
    ) -> None:
        await self._pool.execute(
            """
            UPDATE building_models SET
                status = $2,
                glb_data = $3,
                storeys = $4::jsonb,
                spaces = $5::jsonb,
                error = $6,
                converter_version = $7,
                updated_at = $8
            WHERE asset_id = $1
            """,
            model.asset_id,
            model.status,
            glb_data,
            json.dumps([s.model_dump() for s in model.storeys]),
            json.dumps([s.model_dump() for s in model.spaces]),
            model.error,
            model.converter_version,
            model.updated_at,
        )

    async def fail_processing(self, error: str, updated_at: datetime) -> None:
        await self._pool.execute(
            """
            UPDATE building_models
            SET status = 'failed', error = $1, updated_at = $2
            WHERE status = 'processing'
            """,
            error,
            updated_at,
        )

    async def list_stale_ready_ids(self, current_version: int) -> list[str]:
        rows = await self._pool.fetch(
            """
            SELECT asset_id FROM building_models
            WHERE status = 'ready' AND COALESCE(converter_version, 0) < $1
            ORDER BY updated_at
            """,
            current_version,
        )
        return [row["asset_id"] for row in rows]

    async def get_ifc(self, asset_id: str) -> bytes | None:
        row = await self._pool.fetchrow(
            "SELECT ifc_data FROM building_models WHERE asset_id = $1", asset_id
        )
        return row["ifc_data"] if row else None

    async def get_glb(self, asset_id: str) -> bytes | None:
        row = await self._pool.fetchrow(
            "SELECT glb_data FROM building_models WHERE asset_id = $1", asset_id
        )
        return row["glb_data"] if row else None

    async def delete(self, asset_id: str) -> None:
        await self._pool.execute(
            "DELETE FROM building_models WHERE asset_id = $1", asset_id
        )

    async def delete_many(self, asset_ids: list[str]) -> None:
        await self._pool.execute(
            "DELETE FROM building_models WHERE asset_id = ANY($1::text[])", asset_ids
        )

    async def close(self) -> None:
        await self._pool.close()


__all__ = ["PostgresBuildingModelsStorage"]
