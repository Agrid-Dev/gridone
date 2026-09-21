from __future__ import annotations

import json

import asyncpg

from models.errors import ConflictError
from models.operating_rules import OperatingRule


class PostgresStorage:
    def __init__(self, pool: asyncpg.Pool) -> None:
        self._pool = pool

    async def list_operating_rules(self) -> list[OperatingRule]:
        rows = await self._pool.fetch(
            "SELECT DISTINCT ON (id) document FROM operating_rule_revisions "
            "ORDER BY id, revision DESC"
        )
        return [
            OperatingRule.model_validate(json.loads(row["document"])) for row in rows
        ]

    async def save(self, operating_rule: OperatingRule) -> OperatingRule:
        try:
            row = await self._pool.fetchrow(
                "INSERT INTO operating_rule_revisions (id, revision, document) "
                "SELECT $1, $2, $3::jsonb WHERE $2 = COALESCE("
                "(SELECT MAX(revision) FROM operating_rule_revisions WHERE id = $1), "
                "0) + 1 "
                "RETURNING id",
                operating_rule.id,
                operating_rule.revision,
                operating_rule.model_dump_json(),
            )
        except asyncpg.UniqueViolationError as exc:
            msg = "OperatingRule changed; reload before editing"
            raise ConflictError(msg) from exc
        if row is None:
            msg = "OperatingRule changed; reload before editing"
            raise ConflictError(msg)
        return operating_rule

    async def history(self, operating_rule_id: str) -> list[OperatingRule]:
        rows = await self._pool.fetch(
            "SELECT document FROM operating_rule_revisions"
            " WHERE id = $1 ORDER BY revision",
            operating_rule_id,
        )
        return [
            OperatingRule.model_validate(json.loads(row["document"])) for row in rows
        ]

    async def close(self) -> None:
        await self._pool.close()
