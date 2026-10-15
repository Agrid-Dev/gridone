import builtins
from datetime import datetime

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


def _archived_at(
    *, archived: bool | None, current: datetime | None, now: datetime
) -> datetime | None:
    """Keep the first archive date when archiving again; restoring clears it."""
    if archived is None:
        return current
    return (current or now) if archived else None


class MemoryStorage:
    def __init__(self) -> None:
        self._documents: dict[str, Document] = {}
        self._content: dict[str, bytes] = {}
        self._folders: dict[str, Folder] = {}

    def _check_folder(self, folder_id: str | None) -> None:
        if folder_id is not None and folder_id not in self._folders:
            msg = "The folder does not exist."
            raise InvalidError(msg)

    async def create(self, document: Document, data: bytes) -> Document:
        if document.id in self._documents:
            msg = "Document already exists."
            raise ConflictError(msg)
        self._check_folder(document.folder_id)
        self._documents[document.id] = document.model_copy(deep=True)
        self._content[document.id] = data
        return document.model_copy(deep=True)

    async def get(self, document_id: str) -> Document | None:
        document = self._documents.get(document_id)
        if document is None:
            return None
        return document.model_copy(deep=True)

    async def get_content(self, document_id: str) -> DocumentContent | None:
        document = await self.get(document_id)
        return (
            DocumentContent(document, self._content[document_id]) if document else None
        )

    async def list(
        self,
        filters: DocumentFilters,
        pagination: PaginationParams,
        hidden_folder_ids: frozenset[str] = frozenset(),
    ) -> Page[Document]:
        matched = sorted(
            (
                d
                for d in self._documents.values()
                if filters.matches(d, hidden_folder_ids)
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
        if "folder_id" in patch.model_fields_set:
            self._check_folder(patch.folder_id)
        updated = document.model_copy(
            update={
                **patch.model_dump(exclude_unset=True, exclude={"archived"}),
                "archived_at": _archived_at(
                    archived=patch.archived,
                    current=document.archived_at,
                    now=updated_at,
                ),
                "updated_at": updated_at,
            },
            deep=True,
        )
        self._documents[document_id] = updated
        return updated.model_copy(deep=True)

    async def delete(self, document_id: str) -> None:
        if self._documents.pop(document_id, None) is None:
            msg = "Document not found."
            raise NotFoundError(msg)
        del self._content[document_id]

    async def list_folders(self) -> builtins.list[Folder]:
        return [
            folder.model_copy(deep=True)
            for folder in sorted(
                self._folders.values(), key=lambda f: (f.name.lower(), f.id)
            )
        ]

    async def create_folder(self, folder: Folder) -> Folder:
        if folder.id in self._folders:
            msg = "Folder already exists."
            raise ConflictError(msg)
        if folder.parent_id is not None and folder.parent_id not in self._folders:
            msg = "The parent folder does not exist."
            raise InvalidError(msg)
        self._folders[folder.id] = folder.model_copy(deep=True)
        return folder.model_copy(deep=True)

    async def update_folder(
        self, folder_id: str, patch: FolderUpdate, updated_at: datetime
    ) -> Folder:
        folder = self._folders.get(folder_id)
        if folder is None:
            msg = "Folder not found."
            raise NotFoundError(msg)
        updated = folder.model_copy(
            update={
                **patch.model_dump(exclude_unset=True, exclude={"archived"}),
                "archived_at": _archived_at(
                    archived=patch.archived, current=folder.archived_at, now=updated_at
                ),
                "updated_at": updated_at,
            },
            deep=True,
        )
        self._folders[folder_id] = updated
        return updated.model_copy(deep=True)

    async def delete_folder(self, folder_id: str) -> None:
        if folder_id not in self._folders:
            msg = "Folder not found."
            raise NotFoundError(msg)
        if any(f.parent_id == folder_id for f in self._folders.values()) or any(
            d.folder_id == folder_id for d in self._documents.values()
        ):
            msg = (
                "The folder is not empty; delete or move its contents first, "
                "archived items included."
            )
            raise ConflictError(msg)
        del self._folders[folder_id]

    async def close(self) -> None:
        pass
