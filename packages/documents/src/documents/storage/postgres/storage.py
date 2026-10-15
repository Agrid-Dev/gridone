import builtins
from datetime import datetime

import asyncpg

from documents.models import (
    Document,
    DocumentContent,
    DocumentFilters,
    DocumentUpdate,
    Folder,
    FolderUpdate,
)
from models.errors import ConflictError, InvalidError, NotFoundError
from models.pagination import Page, PaginationParams

# Never select content in metadata queries, including INSERT/UPDATE RETURNING.
_COLUMNS = (
    "id, name, filename, media_type, size, created_by, created_at, "
    "updated_at, asset_ids, device_ids, folder_id, archived_at"
)
# Documents outside any folder have a NULL folder_id, which `<> ALL` alone
# would treat as unknown and drop.
_FILTER = """strpos(lower(name), lower($1)) > 0
    AND ($2::text IS NULL OR asset_ids @> ARRAY[$2]::text[])
    AND ($3::text IS NULL OR device_ids @> ARRAY[$3]::text[])
    AND ($4::text IS NULL OR folder_id = $4)
    AND (NOT $5::boolean OR folder_id IS NULL)
    AND (archived_at IS NOT NULL) = $6::boolean
    AND (folder_id IS NULL OR folder_id <> ALL($7::text[]))"""
# Archiving again keeps the first archive date; restoring clears it.
_ARCHIVED_AT = """CASE WHEN {flag}::boolean IS NULL THEN archived_at
    WHEN {flag}::boolean THEN COALESCE(archived_at, {now}) ELSE NULL END"""
_FOLDER_COLUMNS = "id, name, parent_id, archived_at, created_by, created_at, updated_at"
_MISSING_FOLDER = "The folder does not exist."


class PostgresStorage:
    def __init__(self, pool: asyncpg.Pool) -> None:
        self._pool = pool

    async def create(self, document: Document, data: bytes) -> Document:
        try:
            row = await self._pool.fetchrow(
                f"""INSERT INTO documents ({_COLUMNS}, content)
                VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
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
                document.folder_id,
                document.archived_at,
                data,
            )
        except asyncpg.UniqueViolationError as exc:
            msg = "Document already exists."
            raise ConflictError(msg) from exc
        except asyncpg.ForeignKeyViolationError as exc:
            raise InvalidError(_MISSING_FOLDER) from exc
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
        hidden_folder_ids: frozenset[str] = frozenset(),
    ) -> Page[Document]:
        params = (
            filters.q,
            filters.asset_id,
            filters.device_id,
            filters.folder_id,
            filters.top_level,
            filters.archived,
            sorted(hidden_folder_ids),
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
                ORDER BY created_at DESC, id DESC LIMIT $8 OFFSET $9""",  # noqa: S608
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
        archived_at = _ARCHIVED_AT.format(flag="$7", now="$8")
        try:
            row = await self._pool.fetchrow(
                f"""UPDATE documents SET name = COALESCE($2, name),
                asset_ids = COALESCE($3, asset_ids),
                device_ids = COALESCE($4, device_ids),
                folder_id = CASE WHEN $5::boolean THEN $6::text ELSE folder_id END,
                archived_at = {archived_at},
                updated_at = $8 WHERE id = $1 RETURNING {_COLUMNS}""",  # noqa: S608
                document_id,
                patch.name,
                patch.asset_ids,
                patch.device_ids,
                "folder_id" in patch.model_fields_set,
                patch.folder_id,
                patch.archived,
                updated_at,
            )
        except asyncpg.ForeignKeyViolationError as exc:
            raise InvalidError(_MISSING_FOLDER) from exc
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

    async def list_folders(self) -> builtins.list[Folder]:
        rows = await self._pool.fetch(
            f"SELECT {_FOLDER_COLUMNS} FROM document_folders "  # noqa: S608
            "ORDER BY lower(name), id"
        )
        return [Folder.model_validate(dict(row)) for row in rows]

    async def create_folder(self, folder: Folder) -> Folder:
        try:
            row = await self._pool.fetchrow(
                f"""INSERT INTO document_folders ({_FOLDER_COLUMNS})
                VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING {_FOLDER_COLUMNS}""",  # noqa: S608
                folder.id,
                folder.name,
                folder.parent_id,
                folder.archived_at,
                folder.created_by,
                folder.created_at,
                folder.updated_at,
            )
        except asyncpg.UniqueViolationError as exc:
            msg = "Folder already exists."
            raise ConflictError(msg) from exc
        except asyncpg.ForeignKeyViolationError as exc:
            msg = "The parent folder does not exist."
            raise InvalidError(msg) from exc
        return Folder.model_validate(dict(row))

    async def update_folder(
        self, folder_id: str, patch: FolderUpdate, updated_at: datetime
    ) -> Folder:
        archived_at = _ARCHIVED_AT.format(flag="$3", now="$4")
        row = await self._pool.fetchrow(
            f"""UPDATE document_folders SET name = COALESCE($2, name),
            archived_at = {archived_at}, updated_at = $4
            WHERE id = $1 RETURNING {_FOLDER_COLUMNS}""",  # noqa: S608
            folder_id,
            patch.name,
            patch.archived,
            updated_at,
        )
        if row is None:
            msg = "Folder not found."
            raise NotFoundError(msg)
        return Folder.model_validate(dict(row))

    async def delete_folder(self, folder_id: str) -> None:
        try:
            result = await self._pool.execute(
                "DELETE FROM document_folders WHERE id = $1", folder_id
            )
        except asyncpg.ForeignKeyViolationError as exc:
            msg = (
                "The folder is not empty; delete or move its contents first, "
                "archived items included."
            )
            raise ConflictError(msg) from exc
        if result == "DELETE 0":
            msg = "Folder not found."
            raise NotFoundError(msg)

    async def close(self) -> None:
        await self._pool.close()
