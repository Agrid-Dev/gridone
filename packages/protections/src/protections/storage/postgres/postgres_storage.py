from __future__ import annotations

import json

import asyncpg

from models.errors import ConflictError
from models.protections import Protection


class PostgresStorage:
    def __init__(self, pool: asyncpg.Pool) -> None:
        self._pool = pool

    async def list_protections(self) -> list[Protection]:
        rows = await self._pool.fetch(
            "SELECT DISTINCT ON (id) document FROM protection_revisions "
            "ORDER BY id, revision DESC"
        )
        return [Protection.model_validate(json.loads(row["document"])) for row in rows]

    async def save(self, protection: Protection) -> Protection:
        try:
            row = await self._pool.fetchrow(
                "INSERT INTO protection_revisions (id, revision, document) "
                "SELECT $1, $2, $3::jsonb WHERE $2 = COALESCE("
                "(SELECT MAX(revision) FROM protection_revisions WHERE id = $1), "
                "0) + 1 "
                "RETURNING id",
                protection.id,
                protection.revision,
                protection.model_dump_json(),
            )
        except asyncpg.UniqueViolationError as exc:
            msg = "Protection changed; reload before editing"
            raise ConflictError(msg) from exc
        if row is None:
            msg = "Protection changed; reload before editing"
            raise ConflictError(msg)
        return protection

    async def history(self, protection_id: str) -> list[Protection]:
        rows = await self._pool.fetch(
            "SELECT document FROM protection_revisions WHERE id = $1 ORDER BY revision",
            protection_id,
        )
        return [Protection.model_validate(json.loads(row["document"])) for row in rows]

    async def close(self) -> None:
        await self._pool.close()
