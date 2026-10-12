import asyncio
from datetime import UTC, datetime

from documents.models import (
    Document,
    DocumentAccess,
    DocumentContent,
    DocumentCreate,
    DocumentFilters,
    DocumentUpdate,
)
from documents.storage import build_storage
from documents.storage.protocol import DocumentsStorage
from documents.validation import safe_filename, validate_file
from models.errors import InvalidError, NotFoundError, StorageNotInitializedError
from models.ids import gen_id
from models.pagination import Page, PaginationParams

MAX_DOCUMENT_BYTES = 100 * 1024 * 1024


class DocumentTooLargeError(InvalidError):
    """The received file exceeds the document service's upload limit."""


class DocumentsService:
    def __init__(self, storage_url: str | None) -> None:
        self._storage_url = storage_url
        self._storage: DocumentsStorage | None = None

    async def start(self) -> None:
        if self._storage is None:
            self._storage = await build_storage(self._storage_url)

    async def stop(self) -> None:
        if self._storage is not None:
            await self._storage.close()
            self._storage = None

    @property
    def _backend(self) -> DocumentsStorage:
        if self._storage is None:
            msg = "DocumentsService.start() must be called before use"
            raise StorageNotInitializedError(msg)
        return self._storage

    async def create(
        self, metadata: DocumentCreate, *, filename: str, data: bytes, created_by: str
    ) -> Document:
        if len(data) > MAX_DOCUMENT_BYTES:
            msg = "The document exceeds the upload size limit."
            raise DocumentTooLargeError(msg)
        if not data:
            msg = "The document is empty."
            raise InvalidError(msg)
        filename = safe_filename(filename)
        media_type = await asyncio.to_thread(validate_file, filename, data)
        now = datetime.now(UTC)
        document = Document(
            **metadata.model_dump(),
            id=gen_id(),
            filename=filename,
            media_type=media_type,
            size=len(data),
            created_by=created_by,
            created_at=now,
            updated_at=now,
        )
        return await self._backend.create(document, data)

    async def list(
        self,
        access: DocumentAccess,
        *,
        filters: DocumentFilters | None = None,
        pagination: PaginationParams | None = None,
    ) -> Page[Document]:
        return await self._backend.list(
            access, filters or DocumentFilters(), pagination or PaginationParams()
        )

    async def get(self, document_id: str, access: DocumentAccess) -> Document:
        document = await self._backend.get(document_id, access)
        if document is None:
            msg = "Document not found."
            raise NotFoundError(msg)
        return document

    async def get_content(
        self, document_id: str, access: DocumentAccess
    ) -> DocumentContent:
        content = await self._backend.get_content(document_id, access)
        if content is None:
            msg = "Document not found."
            raise NotFoundError(msg)
        return content

    async def update(self, document_id: str, patch: DocumentUpdate) -> Document:
        return await self._backend.update(document_id, patch, datetime.now(UTC))

    async def delete(self, document_id: str) -> None:
        await self._backend.delete(document_id)

    async def has_role_reference(self, role_id: str) -> bool:
        return await self._backend.has_role_reference(role_id)
