import asyncpg

from assets.models import AssetInDB, DeviceAssetLink


class PostgresAssetsStorage:
    """PostgreSQL-backed storage for assets using ltree."""

    _pool: asyncpg.Pool

    def __init__(self, pool: asyncpg.Pool) -> None:
        self._pool = pool

    async def ensure_schema(self) -> None:
        await self._pool.execute("CREATE EXTENSION IF NOT EXISTS ltree")

        await self._pool.execute(
            """
            CREATE TABLE IF NOT EXISTS assets (
                id          TEXT PRIMARY KEY,
                parent_id   TEXT REFERENCES assets(id),
                type        TEXT NOT NULL,
                name        TEXT NOT NULL,
                path        LTREE
            )
            """
        )

        await self._pool.execute(
            """
            CREATE INDEX IF NOT EXISTS idx_assets_path
            ON assets USING gist (path)
            """
        )

        await self._pool.execute(
            """
            CREATE INDEX IF NOT EXISTS idx_assets_parent_id
            ON assets (parent_id)
            """
        )

        # Trigger function: compute path from parent chain on INSERT/UPDATE
        await self._pool.execute(
            """
            CREATE OR REPLACE FUNCTION compute_asset_path()
            RETURNS TRIGGER AS $$
            DECLARE
                parent_path LTREE;
                sanitized_id TEXT;
            BEGIN
                sanitized_id := regexp_replace(
                    lower(NEW.id), '[^a-z0-9_]', '_', 'g'
                );
                IF NEW.parent_id IS NULL THEN
                    NEW.path := sanitized_id::LTREE;
                ELSE
                    SELECT path INTO parent_path
                    FROM assets WHERE id = NEW.parent_id;
                    NEW.path := parent_path || sanitized_id::LTREE;
                END IF;
                RETURN NEW;
            END;
            $$ LANGUAGE plpgsql
            """
        )

        await self._pool.execute(
            """
            DO $$
            BEGIN
                IF NOT EXISTS (
                    SELECT 1 FROM pg_trigger
                    WHERE tgname = 'trg_asset_path'
                ) THEN
                    CREATE TRIGGER trg_asset_path
                        BEFORE INSERT OR UPDATE ON assets
                        FOR EACH ROW
                        EXECUTE FUNCTION compute_asset_path();
                END IF;
            END
            $$
            """
        )

        # Recursive function to update descendant paths
        await self._pool.execute(
            """
            CREATE OR REPLACE FUNCTION update_descendant_paths(moved_id TEXT)
            RETURNS VOID AS $$
            DECLARE
                child RECORD;
            BEGIN
                FOR child IN SELECT id FROM assets WHERE parent_id = moved_id
                LOOP
                    -- Re-trigger compute_asset_path by touching the row
                    UPDATE assets SET parent_id = parent_id WHERE id = child.id;
                    PERFORM update_descendant_paths(child.id);
                END LOOP;
            END;
            $$ LANGUAGE plpgsql
            """
        )

        # Device-asset links table
        await self._pool.execute(
            """
            CREATE TABLE IF NOT EXISTS device_asset_links (
                device_id   TEXT NOT NULL,
                asset_id    TEXT NOT NULL REFERENCES assets(id) ON DELETE CASCADE,
                PRIMARY KEY (device_id, asset_id)
            )
            """
        )

    def _row_to_model(self, row: asyncpg.Record) -> AssetInDB:
        return AssetInDB(
            id=row["id"],
            parent_id=row["parent_id"],
            type=row["type"],
            name=row["name"],
            path=str(row["path"]) if row["path"] else "",
        )

    async def get_by_id(self, asset_id: str) -> AssetInDB | None:
        row = await self._pool.fetchrow(
            "SELECT * FROM assets WHERE id = $1", asset_id
        )
        return self._row_to_model(row) if row else None

    async def list_all(self) -> list[AssetInDB]:
        rows = await self._pool.fetch("SELECT * FROM assets ORDER BY path")
        return [self._row_to_model(r) for r in rows]

    async def list_by_parent(self, parent_id: str | None) -> list[AssetInDB]:
        if parent_id is None:
            rows = await self._pool.fetch(
                "SELECT * FROM assets WHERE parent_id IS NULL ORDER BY name"
            )
        else:
            rows = await self._pool.fetch(
                "SELECT * FROM assets WHERE parent_id = $1 ORDER BY name",
                parent_id,
            )
        return [self._row_to_model(r) for r in rows]

    async def save(self, asset: AssetInDB) -> None:
        await self._pool.execute(
            """
            INSERT INTO assets (id, parent_id, type, name)
            VALUES ($1, $2, $3, $4)
            ON CONFLICT (id) DO UPDATE SET
                parent_id = EXCLUDED.parent_id,
                type = EXCLUDED.type,
                name = EXCLUDED.name
            """,
            asset.id,
            asset.parent_id,
            asset.type,
            asset.name,
        )

    async def delete(self, asset_id: str) -> None:
        await self._pool.execute("DELETE FROM assets WHERE id = $1", asset_id)

    async def get_children(self, asset_id: str) -> list[AssetInDB]:
        rows = await self._pool.fetch(
            "SELECT * FROM assets WHERE parent_id = $1 ORDER BY name",
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
        await self._pool.execute(
            "SELECT update_descendant_paths($1)", asset_id
        )

    # Device-asset linking

    async def link_device(self, link: DeviceAssetLink) -> None:
        await self._pool.execute(
            """
            INSERT INTO device_asset_links (device_id, asset_id)
            VALUES ($1, $2)
            ON CONFLICT (device_id, asset_id) DO NOTHING
            """,
            link.device_id,
            link.asset_id,
        )

    async def unlink_device(self, device_id: str, asset_id: str) -> None:
        await self._pool.execute(
            "DELETE FROM device_asset_links WHERE device_id = $1 AND asset_id = $2",
            device_id,
            asset_id,
        )

    async def get_device_ids_for_asset(self, asset_id: str) -> list[str]:
        rows = await self._pool.fetch(
            "SELECT device_id FROM device_asset_links"
            " WHERE asset_id = $1 ORDER BY device_id",
            asset_id,
        )
        return [row["device_id"] for row in rows]

    async def get_asset_ids_for_device(self, device_id: str) -> list[str]:
        rows = await self._pool.fetch(
            "SELECT asset_id FROM device_asset_links"
            " WHERE device_id = $1 ORDER BY asset_id",
            device_id,
        )
        return [row["asset_id"] for row in rows]
