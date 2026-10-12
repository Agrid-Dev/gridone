from datetime import datetime
from typing import Protocol

from documents.models import (
    Document,
    DocumentAccess,
    DocumentContent,
    DocumentFilters,
    DocumentUpdate,
)
from models.pagination import Page, PaginationParams


class DocumentsStorage(Protocol):
    async def create(self, document: Document, data: bytes) -> Document: ...
    async def get(
        self, document_id: str, access: DocumentAccess
    ) -> Document | None: ...
    async def get_content(
        self, document_id: str, access: DocumentAccess
    ) -> DocumentContent | None: ...
    async def list(
        self,
        access: DocumentAccess,
        filters: DocumentFilters,
        pagination: PaginationParams,
    ) -> Page[Document]: ...
    async def update(
        self, document_id: str, patch: DocumentUpdate, updated_at: datetime
    ) -> Document: ...
    async def delete(self, document_id: str) -> None: ...
    async def has_role_reference(self, role_id: str) -> bool: ...
    async def close(self) -> None: ...
