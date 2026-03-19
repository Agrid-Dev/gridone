from datetime import UTC

import asyncpg

from apps.models import App, AppStatus


class PostgresAppStorage:
    """PostgreSQL-backed storage for registered apps."""

    _pool: asyncpg.Pool

    def __init__(self, pool: asyncpg.Pool) -> None:
        self._pool = pool

    def _row_to_model(self, row: asyncpg.Record) -> App:
        created_at = row["created_at"]
        if created_at.tzinfo is None:
            created_at = created_at.replace(tzinfo=UTC)
        return App(
            id=row["id"],
            user_id=row["user_id"],
            name=row["name"],
            description=row["description"],
            api_url=row["api_url"],
            icon=row["icon"],
            status=AppStatus(row["status"]),
            manifest=row["manifest"],
            created_at=created_at,
        )

    async def get_by_id(self, app_id: str) -> App | None:
        row = await self._pool.fetchrow("SELECT * FROM apps WHERE id = $1", app_id)
        return self._row_to_model(row) if row else None

    async def list_all(self) -> list[App]:
        rows = await self._pool.fetch("SELECT * FROM apps ORDER BY created_at DESC")
        return [self._row_to_model(r) for r in rows]

    async def save(self, app: App) -> None:
        created_at = app.created_at
        if created_at.tzinfo is not None:
            created_at = created_at.replace(tzinfo=None)
        await self._pool.execute(
            """
            INSERT INTO apps (
                id, user_id, name, description, api_url,
                icon, status, manifest, created_at
            )
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
            ON CONFLICT (id) DO UPDATE SET
                user_id = EXCLUDED.user_id,
                name = EXCLUDED.name,
                description = EXCLUDED.description,
                api_url = EXCLUDED.api_url,
                icon = EXCLUDED.icon,
                status = EXCLUDED.status,
                manifest = EXCLUDED.manifest,
                created_at = EXCLUDED.created_at
            """,
            app.id,
            app.user_id,
            app.name,
            app.description,
            app.api_url,
            app.icon,
            app.status,
            app.manifest,
            created_at,
        )

    async def close(self) -> None:
        await self._pool.close()
