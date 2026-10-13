from datetime import datetime
from typing import Protocol

from documents.models import (
    Document,
    DocumentContent,
    DocumentFilters,
    DocumentUpdate,
)
from models.pagination import Page, PaginationParams


class DocumentsStorage(Protocol):
    async def create(self, document: Document, data: bytes) -> Document: ...
    async def get(self, document_id: str) -> Document | None: ...
    async def get_content(self, document_id: str) -> DocumentContent | None: ...
    async def list(
        self,
        filters: DocumentFilters,
        pagination: PaginationParams,
    ) -> Page[Document]: ...
    async def update(
        self, document_id: str, patch: DocumentUpdate, updated_at: datetime
    ) -> Document: ...
    async def delete(self, document_id: str) -> None: ...
    async def close(self) -> None: ...
