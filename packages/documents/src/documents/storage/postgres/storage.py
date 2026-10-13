from datetime import datetime

import asyncpg

from documents.models import (
    Document,
    DocumentContent,
    DocumentFilters,
    DocumentUpdate,
)
from models.errors import ConflictError, NotFoundError
from models.pagination import Page, PaginationParams

# Never select content in metadata queries, including INSERT/UPDATE RETURNING.
_COLUMNS = (
    "id, name, filename, media_type, size, created_by, created_at, "
    "updated_at, asset_ids, device_ids"
)
_FILTER = """strpos(lower(name), lower($1)) > 0
    AND ($2::text IS NULL OR asset_ids @> ARRAY[$2]::text[])
    AND ($3::text IS NULL OR device_ids @> ARRAY[$3]::text[])"""


class PostgresStorage:
    def __init__(self, pool: asyncpg.Pool) -> None:
        self._pool = pool

    async def create(self, document: Document, data: bytes) -> Document:
        try:
            row = await self._pool.fetchrow(
                f"""INSERT INTO documents ({_COLUMNS}, content)
                VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
                RETURNING {_COLUMNS}""",  # noqa: S608
                document.id,
                document.name,
                document.filename,
                document.media_type,
                document.size,
                document.created_by,
                document.created_at,
                document.updated_at,
                document.asset_ids,
                document.device_ids,
                data,
            )
        except asyncpg.UniqueViolationError as exc:
            msg = "Document already exists."
            raise ConflictError(msg) from exc
        return Document.model_validate(dict(row))

    async def get(self, document_id: str) -> Document | None:
        row = await self._pool.fetchrow(
            f"SELECT {_COLUMNS} FROM documents WHERE id = $1",  # noqa: S608
            document_id,
        )
        return Document.model_validate(dict(row)) if row else None

    async def get_content(self, document_id: str) -> DocumentContent | None:
        row = await self._pool.fetchrow(
            f"SELECT {_COLUMNS}, content FROM documents WHERE id = $1",  # noqa: S608
            document_id,
        )
        if row is None:
            return None
        values = dict(row)
        data = values.pop("content")
        return DocumentContent(Document.model_validate(values), data)

    async def list(
        self,
        filters: DocumentFilters,
        pagination: PaginationParams,
    ) -> Page[Document]:
        params = (
            filters.q,
            filters.asset_id,
            filters.device_id,
        )
        async with (
            self._pool.acquire() as connection,
            connection.transaction(isolation="repeatable_read", readonly=True),
        ):
            total = await connection.fetchval(
                f"SELECT count(*) FROM documents WHERE {_FILTER}",  # noqa: S608
                *params,
            )
            rows = await connection.fetch(
                f"""SELECT {_COLUMNS} FROM documents WHERE {_FILTER}
                ORDER BY created_at DESC, id DESC LIMIT $4 OFFSET $5""",  # noqa: S608
                *params,
                pagination.limit,
                pagination.offset,
            )
        return Page(
            items=[Document.model_validate(dict(row)) for row in rows],
            total=total,
            page=pagination.page,
            size=pagination.size,
        )

    async def update(
        self, document_id: str, patch: DocumentUpdate, updated_at: datetime
    ) -> Document:
        row = await self._pool.fetchrow(
            f"""UPDATE documents SET name = COALESCE($2, name),
            asset_ids = COALESCE($3, asset_ids), device_ids = COALESCE($4, device_ids),
            updated_at = $5 WHERE id = $1 RETURNING {_COLUMNS}""",  # noqa: S608
            document_id,
            patch.name,
            patch.asset_ids,
            patch.device_ids,
            updated_at,
        )
        if row is None:
            msg = "Document not found."
            raise NotFoundError(msg)
        return Document.model_validate(dict(row))

    async def delete(self, document_id: str) -> None:
        result = await self._pool.execute(
            "DELETE FROM documents WHERE id = $1", document_id
        )
        if result == "DELETE 0":
            msg = "Document not found."
            raise NotFoundError(msg)

    async def close(self) -> None:
        await self._pool.close()
