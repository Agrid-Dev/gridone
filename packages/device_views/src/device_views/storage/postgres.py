import asyncio
from pathlib import Path

import asyncpg
from yoyo import get_backend, read_migrations

from device_views.models import DeviceView
from models.errors import NotFoundError


def run_migrations(url: str) -> None:
    backend = get_backend(url)
    migrations = read_migrations(str(Path(__file__).parent / "migrations"))
    with backend.lock():
        backend.apply_migrations(backend.to_apply(migrations))


async def build_postgres_storage(url: str) -> "PostgresViewStorage":
    await asyncio.to_thread(run_migrations, url)
    return PostgresViewStorage(await asyncpg.create_pool(url, min_size=1, max_size=3))


class PostgresViewStorage:
    def __init__(self, pool: asyncpg.Pool) -> None:
        self._pool = pool

    async def list(self) -> list[DeviceView]:
        rows = await self._pool.fetch(
            "SELECT data FROM device_views ORDER BY data->>'name', id"
        )
        return [DeviceView.model_validate_json(row["data"]) for row in rows]

    async def get(self, view_id: str) -> DeviceView:
        data = await self._pool.fetchval(
            "SELECT data FROM device_views WHERE id = $1", view_id
        )
        if data is None:
            msg = "Device view not found"
            raise NotFoundError(msg)
        return DeviceView.model_validate_json(data)

    async def create(self, view: DeviceView) -> DeviceView:
        await self._pool.execute(
            "INSERT INTO device_views (id, data) VALUES ($1, $2::jsonb)",
            view.id,
            view.model_dump_json(),
        )
        return view

    async def update(self, view: DeviceView) -> DeviceView:
        result = await self._pool.execute(
            "UPDATE device_views SET data = $2::jsonb WHERE id = $1",
            view.id,
            view.model_dump_json(),
        )
        if result == "UPDATE 0":
            msg = "Device view not found"
            raise NotFoundError(msg)
        return view

    async def delete(self, view_id: str) -> None:
        result = await self._pool.execute(
            "DELETE FROM device_views WHERE id = $1", view_id
        )
        if result == "DELETE 0":
            msg = "Device view not found"
            raise NotFoundError(msg)

    async def close(self) -> None:
        await self._pool.close()
