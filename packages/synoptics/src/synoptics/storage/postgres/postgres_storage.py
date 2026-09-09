"""Postgres plate store: one row per plate, the document in a JSONB column."""

from typing import Any

import asyncpg

from models.errors import ConflictError, NotFoundError
from models.metadata import ResourceMetadata
from synoptics.models import ENVELOPE_FIELDS, Synoptic, SynopticSummary


def _document_json(synoptic: Synoptic) -> dict[str, Any]:
    """The authored document, without the service-assigned envelope.

    ``by_alias`` so the pipe's ``from`` field keeps its authored name instead of
    the ``from_`` the reserved keyword forces on the model.
    """
    return synoptic.model_dump(mode="json", by_alias=True, exclude=ENVELOPE_FIELDS)


class PostgresSynopticsStorage:
    def __init__(self, pool: asyncpg.Pool) -> None:
        self._pool = pool

    def _row_to_synoptic(self, row: asyncpg.Record) -> Synoptic:
        return Synoptic.model_validate(
            {
                **row["document"],
                "id": row["id"],
                "metadata": {
                    "created_at": row["created_at"],
                    "updated_at": row["updated_at"],
                },
            }
        )

    def _row_to_summary(self, row: asyncpg.Record) -> SynopticSummary:
        return SynopticSummary(
            id=row["id"],
            name=row["name"],
            description=row["description"],
            projection=row["projection"],
            metadata=ResourceMetadata(
                created_at=row["created_at"], updated_at=row["updated_at"]
            ),
        )

    async def create(self, synoptic: Synoptic) -> Synoptic:
        try:
            row = await self._pool.fetchrow(
                """
                INSERT INTO synoptics (id, document, created_at, updated_at)
                VALUES ($1, $2, $3, $4)
                RETURNING *
                """,
                synoptic.id,
                _document_json(synoptic),
                synoptic.metadata.created_at,
                synoptic.metadata.updated_at,
            )
        except asyncpg.UniqueViolationError as exc:
            # Without this the driver's own error escapes the package and the
            # API turns it into a 500 rather than a conflict.
            msg = f"Synoptic {synoptic.id!r} already exists"
            raise ConflictError(msg) from exc
        return self._row_to_synoptic(row)

    async def get(self, synoptic_id: str) -> Synoptic | None:
        row = await self._pool.fetchrow(
            "SELECT * FROM synoptics WHERE id = $1", synoptic_id
        )
        if row is None:
            return None
        return self._row_to_synoptic(row)

    async def list_summaries(
        self, *, limit: int | None = None, offset: int | None = None
    ) -> list[SynopticSummary]:
        # The envelope is read out of the document rather than duplicated into
        # columns, so an index can never drift from the plate it describes.
        query = (
            "SELECT id, "
            "document->>'name' AS name, "
            "document->>'description' AS description, "
            "document->>'projection' AS projection, "
            "created_at, updated_at "
            # created_at alone is not unique, and LIMIT/OFFSET over a
            # non-deterministic order repeats rows across pages.
            "FROM synoptics ORDER BY created_at, id"
        )
        params: list[object] = []
        idx = 1
        if limit is not None:
            query += f" LIMIT ${idx}"
            params.append(limit)
            idx += 1
        if offset is not None:
            query += f" OFFSET ${idx}"
            params.append(offset)
        rows = await self._pool.fetch(query, *params)
        return [self._row_to_summary(r) for r in rows]

    async def count(self) -> int:
        return await self._pool.fetchval("SELECT COUNT(*) FROM synoptics")

    async def update(self, synoptic: Synoptic) -> Synoptic:
        row = await self._pool.fetchrow(
            """
            UPDATE synoptics
            SET document = $2, updated_at = $3
            WHERE id = $1
            RETURNING *
            """,
            synoptic.id,
            _document_json(synoptic),
            synoptic.metadata.updated_at,
        )
        if row is None:
            msg = f"Synoptic {synoptic.id!r} not found"
            raise NotFoundError(msg)
        return self._row_to_synoptic(row)

    async def delete(self, synoptic_id: str) -> None:
        row = await self._pool.fetchrow(
            "DELETE FROM synoptics WHERE id = $1 RETURNING id", synoptic_id
        )
        if row is None:
            msg = f"Synoptic {synoptic_id!r} not found"
            raise NotFoundError(msg)

    async def close(self) -> None:
        await self._pool.close()
