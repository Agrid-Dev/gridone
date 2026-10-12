from datetime import datetime

import asyncpg

from documents.models import (
    Document,
    DocumentAccess,
    DocumentContent,
    DocumentFilters,
    DocumentUpdate,
)
from models.errors import ConflictError, NotFoundError
from models.pagination import Page, PaginationParams

# Never select content in metadata queries, including INSERT/UPDATE RETURNING.
_COLUMNS = (
    "id, name, filename, media_type, size, created_by, created_at, "
    "updated_at, allowed_role_ids, asset_ids, device_ids"
)
_READ = "id = $1 AND ($2::boolean OR allowed_role_ids @> ARRAY[$3]::text[])"
_FILTER = """($1::boolean OR allowed_role_ids @> ARRAY[$2]::text[])
    AND strpos(lower(name), lower($3)) > 0
    AND ($4::text IS NULL OR asset_ids @> ARRAY[$4]::text[])
    AND ($5::text IS NULL OR device_ids @> ARRAY[$5]::text[])"""


class PostgresStorage:
    def __init__(self, pool: asyncpg.Pool) -> None:
        self._pool = pool

    async def create(self, document: Document, data: bytes) -> Document:
        try:
            row = await self._pool.fetchrow(
                f"""INSERT INTO documents ({_COLUMNS}, content)
                VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
                RETURNING {_COLUMNS}""",  # noqa: S608
                document.id,
                document.name,
                document.filename,
                document.media_type,
                document.size,
                document.created_by,
                document.created_at,
                document.updated_at,
                document.allowed_role_ids,
                document.asset_ids,
                document.device_ids,
                data,
            )
        except asyncpg.UniqueViolationError as exc:
            msg = "Document already exists."
            raise ConflictError(msg) from exc
        return Document.model_validate(dict(row))

    async def get(self, document_id: str, access: DocumentAccess) -> Document | None:
        row = await self._pool.fetchrow(
            f"SELECT {_COLUMNS} FROM documents WHERE {_READ}",  # noqa: S608
            document_id,
            access.is_admin,
            access.role_id,
        )
        return Document.model_validate(dict(row)) if row else None

    async def get_content(
        self, document_id: str, access: DocumentAccess
    ) -> DocumentContent | None:
        row = await self._pool.fetchrow(
            f"SELECT {_COLUMNS}, content FROM documents WHERE {_READ}",  # noqa: S608
            document_id,
            access.is_admin,
            access.role_id,
        )
        if row is None:
            return None
        values = dict(row)
        data = values.pop("content")
        return DocumentContent(Document.model_validate(values), data)

    async def list(
        self,
        access: DocumentAccess,
        filters: DocumentFilters,
        pagination: PaginationParams,
    ) -> Page[Document]:
        params = (
            access.is_admin,
            access.role_id,
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
                ORDER BY created_at DESC, id DESC LIMIT $6 OFFSET $7""",  # noqa: S608
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
            allowed_role_ids = COALESCE($3, allowed_role_ids),
            asset_ids = COALESCE($4, asset_ids), device_ids = COALESCE($5, device_ids),
            updated_at = $6 WHERE id = $1 RETURNING {_COLUMNS}""",  # noqa: S608
            document_id,
            patch.name,
            patch.allowed_role_ids,
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

    async def has_role_reference(self, role_id: str) -> bool:
        return await self._pool.fetchval(
            "SELECT EXISTS (SELECT 1 FROM documents "
            "WHERE allowed_role_ids @> ARRAY[$1]::text[])",
            role_id,
        )

    async def close(self) -> None:
        await self._pool.close()
