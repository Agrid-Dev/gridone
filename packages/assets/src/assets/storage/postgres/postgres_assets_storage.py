import json
from datetime import datetime

import asyncpg

from assets.models import BuildingProfile
from assets.storage.models import AssetInDB, BuildingModelInDB

_PROFILE_ID = "singleton"


class PostgresAssetsStorage:
    """PostgreSQL-backed storage for assets using ltree."""

    _pool: asyncpg.Pool

    def __init__(self, pool: asyncpg.Pool) -> None:
        self._pool = pool

    async def get_profile(self) -> BuildingProfile | None:
        row = await self._pool.fetchrow(
            "SELECT data FROM building_profile WHERE id = $1", _PROFILE_ID
        )
        return BuildingProfile.model_validate_json(row["data"]) if row else None

    async def save_profile(self, profile: BuildingProfile) -> None:
        await self._pool.execute(
            """
            INSERT INTO building_profile (id, data) VALUES ($1, $2::jsonb)
            ON CONFLICT (id) DO UPDATE SET data = EXCLUDED.data
            """,
            _PROFILE_ID,
            profile.model_dump_json(),
        )

    def _row_to_model(self, row: asyncpg.Record) -> AssetInDB:
        return AssetInDB(
            id=row["id"],
            parent_id=row["parent_id"],
            type=row["type"],
            name=row["name"],
            path=str(row["path"]).split(".") if row["path"] else [],
            position=row["position"],
            ifc_global_id=row["ifc_global_id"],
            created_at=row["created_at"],
            updated_at=row["updated_at"],
        )

    async def get_by_id(self, asset_id: str) -> AssetInDB | None:
        row = await self._pool.fetchrow("SELECT * FROM assets WHERE id = $1", asset_id)
        return self._row_to_model(row) if row else None

    async def list_all(self) -> list[AssetInDB]:
        rows = await self._pool.fetch("SELECT * FROM assets ORDER BY path")
        return [self._row_to_model(r) for r in rows]

    async def list_by_parent(self, parent_id: str | None) -> list[AssetInDB]:
        if parent_id is None:
            rows = await self._pool.fetch(
                "SELECT * FROM assets WHERE parent_id IS NULL ORDER BY position, name"
            )
        else:
            rows = await self._pool.fetch(
                "SELECT * FROM assets WHERE parent_id = $1 ORDER BY position, name",
                parent_id,
            )
        return [self._row_to_model(r) for r in rows]

    async def save(self, asset: AssetInDB) -> None:
        await self._pool.execute(
            """
            INSERT INTO assets
                (id, parent_id, type, name, position, ifc_global_id,
                 created_at, updated_at)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
            ON CONFLICT (id) DO UPDATE SET
                parent_id = EXCLUDED.parent_id,
                type = EXCLUDED.type,
                name = EXCLUDED.name,
                position = EXCLUDED.position,
                ifc_global_id = EXCLUDED.ifc_global_id,
                updated_at = EXCLUDED.updated_at
            """,
            asset.id,
            asset.parent_id,
            asset.type,
            asset.name,
            asset.position,
            asset.ifc_global_id,
            asset.created_at,
            asset.updated_at,
        )

    async def delete(self, asset_id: str) -> None:
        await self._pool.execute("DELETE FROM assets WHERE id = $1", asset_id)

    async def get_children(self, asset_id: str) -> list[AssetInDB]:
        rows = await self._pool.fetch(
            "SELECT * FROM assets WHERE parent_id = $1 ORDER BY position, name",
            asset_id,
        )
        return [self._row_to_model(r) for r in rows]

    async def get_descendants(self, asset_id: str) -> list[AssetInDB]:
        rows = await self._pool.fetch(
            """
            SELECT a.* FROM assets a
            WHERE a.path <@ (SELECT path FROM assets WHERE id = $1)
              AND a.id != $1
            ORDER BY a.path
            """,
            asset_id,
        )
        return [self._row_to_model(r) for r in rows]

    async def update_descendant_paths(self, asset_id: str) -> None:
        await self._pool.execute("SELECT update_descendant_paths($1)", asset_id)

    async def get_next_position(self, parent_id: str) -> int:
        row = await self._pool.fetchrow(
            "SELECT COALESCE(MAX(position), -1) + 1 AS next_pos"
            " FROM assets WHERE parent_id = $1",
            parent_id,
        )
        return row["next_pos"]

    async def reorder_siblings(
        self, parent_id: str, ordered_ids: list[str], updated_at: datetime
    ) -> None:
        if not ordered_ids:
            return
        async with self._pool.acquire() as conn, conn.transaction():
            for pos, asset_id in enumerate(ordered_ids):
                await conn.execute(
                    "UPDATE assets SET position = $1, updated_at = $4 "
                    "WHERE id = $2 AND parent_id = $3",
                    pos,
                    asset_id,
                    parent_id,
                    updated_at,
                )

    async def delete_descendants(self, asset_id: str) -> None:
        await self._pool.execute(
            """
            DELETE FROM assets a
            WHERE a.path <@ (SELECT path FROM assets WHERE id = $1)
              AND a.id != $1
            """,
            asset_id,
        )

    def _row_to_model_meta(self, row: asyncpg.Record) -> BuildingModelInDB:
        return BuildingModelInDB(
            asset_id=row["asset_id"],
            status=row["status"],
            filename=row["filename"],
            error=row["error"],
            ifc_size=row["ifc_size"] or 0,
            glb_size=row["glb_size"],
            storeys=json.loads(row["storeys"]),
            spaces=json.loads(row["spaces"]),
            created_at=row["created_at"],
            updated_at=row["updated_at"],
        )

    async def get_model(self, asset_id: str) -> BuildingModelInDB | None:
        row = await self._pool.fetchrow(
            """
            SELECT asset_id, status, filename, error,
                   octet_length(ifc_data) AS ifc_size,
                   octet_length(glb_data) AS glb_size,
                   storeys, spaces, created_at, updated_at
            FROM building_models WHERE asset_id = $1
            """,
            asset_id,
        )
        return self._row_to_model_meta(row) if row else None

    async def save_model(self, model: BuildingModelInDB, ifc_data: bytes) -> None:
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

    async def set_model_result(
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
                updated_at = $7
            WHERE asset_id = $1
            """,
            model.asset_id,
            model.status,
            glb_data,
            json.dumps([s.model_dump() for s in model.storeys]),
            json.dumps([s.model_dump() for s in model.spaces]),
            model.error,
            model.updated_at,
        )

    async def fail_processing_models(self, error: str, updated_at: datetime) -> None:
        await self._pool.execute(
            """
            UPDATE building_models
            SET status = 'failed', error = $1, updated_at = $2
            WHERE status = 'processing'
            """,
            error,
            updated_at,
        )

    async def get_model_ifc(self, asset_id: str) -> bytes | None:
        row = await self._pool.fetchrow(
            "SELECT ifc_data FROM building_models WHERE asset_id = $1", asset_id
        )
        return row["ifc_data"] if row else None

    async def get_model_glb(self, asset_id: str) -> bytes | None:
        row = await self._pool.fetchrow(
            "SELECT glb_data FROM building_models WHERE asset_id = $1", asset_id
        )
        return row["glb_data"] if row else None

    async def delete_model(self, asset_id: str) -> None:
        await self._pool.execute(
            "DELETE FROM building_models WHERE asset_id = $1", asset_id
        )

    async def close(self) -> None:
        await self._pool.close()
