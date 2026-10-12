from datetime import datetime

from documents.models import (
    Document,
    DocumentAccess,
    DocumentContent,
    DocumentFilters,
    DocumentUpdate,
)
from models.errors import ConflictError, NotFoundError
from models.pagination import Page, PaginationParams


class MemoryStorage:
    def __init__(self) -> None:
        self._documents: dict[str, Document] = {}
        self._content: dict[str, bytes] = {}

    async def create(self, document: Document, data: bytes) -> Document:
        if document.id in self._documents:
            msg = "Document already exists."
            raise ConflictError(msg)
        self._documents[document.id] = document.model_copy(deep=True)
        self._content[document.id] = data
        return document.model_copy(deep=True)

    async def get(self, document_id: str, access: DocumentAccess) -> Document | None:
        document = self._documents.get(document_id)
        if document is None or not access.can_read(document):
            return None
        return document.model_copy(deep=True)

    async def get_content(
        self, document_id: str, access: DocumentAccess
    ) -> DocumentContent | None:
        document = await self.get(document_id, access)
        return (
            DocumentContent(document, self._content[document_id]) if document else None
        )

    async def list(
        self,
        access: DocumentAccess,
        filters: DocumentFilters,
        pagination: PaginationParams,
    ) -> Page[Document]:
        matched = sorted(
            (
                d
                for d in self._documents.values()
                if access.can_read(d) and filters.matches(d)
            ),
            key=lambda d: (d.created_at, d.id),
            reverse=True,
        )
        items = matched[pagination.offset : pagination.offset + pagination.limit]
        return Page(
            items=[d.model_copy(deep=True) for d in items],
            total=len(matched),
            page=pagination.page,
            size=pagination.size,
        )

    async def update(
        self, document_id: str, patch: DocumentUpdate, updated_at: datetime
    ) -> Document:
        document = self._documents.get(document_id)
        if document is None:
            msg = "Document not found."
            raise NotFoundError(msg)
        updated = document.model_copy(
            update={**patch.model_dump(exclude_unset=True), "updated_at": updated_at},
            deep=True,
        )
        self._documents[document_id] = updated
        return updated.model_copy(deep=True)

    async def delete(self, document_id: str) -> None:
        if self._documents.pop(document_id, None) is None:
            msg = "Document not found."
            raise NotFoundError(msg)
        del self._content[document_id]

    async def has_role_reference(self, role_id: str) -> bool:
        return any(role_id in d.allowed_role_ids for d in self._documents.values())

    async def close(self) -> None:
        pass
