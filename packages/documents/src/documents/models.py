from collections import defaultdict
from collections.abc import Iterable
from dataclasses import dataclass
from datetime import datetime
from typing import Annotated, Self

from pydantic import BaseModel, ConfigDict, Field, StringConstraints, model_validator

type Name = Annotated[
    str, StringConstraints(strip_whitespace=True, min_length=1, max_length=255)
]
type Reference = Annotated[str, StringConstraints(min_length=1, max_length=128)]
# Keep the list alias transparent so FastAPI reads every repeated form value.
References = Annotated[list[Reference], Field(max_length=200)]


class FolderCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    name: Name
    parent_id: Reference | None = None


class FolderUpdate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    name: Name | None = None
    archived: bool | None = None

    @model_validator(mode="after")
    def reject_explicit_nulls(self) -> Self:
        if any(getattr(self, key) is None for key in self.model_fields_set):
            msg = "Folder fields cannot be null."
            raise ValueError(msg)
        return self


class Folder(FolderCreate):
    id: str
    archived_at: datetime | None = None
    created_by: str
    created_at: datetime
    updated_at: datetime


class DocumentCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    name: Name
    folder_id: Reference | None = None
    asset_ids: References = Field(default_factory=list)
    device_ids: References = Field(default_factory=list)


class DocumentUpdate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    name: Name | None = None
    # An explicit null moves the document out of its folder, to the top level.
    folder_id: Reference | None = None
    asset_ids: References | None = None
    device_ids: References | None = None
    archived: bool | None = None

    @model_validator(mode="after")
    def reject_explicit_nulls(self) -> Self:
        if any(
            getattr(self, key) is None for key in self.model_fields_set - {"folder_id"}
        ):
            msg = "Document fields cannot be null; use [] to clear links."
            raise ValueError(msg)
        return self


class Document(DocumentCreate):
    id: str
    filename: str
    media_type: str
    size: int
    archived_at: datetime | None = None
    created_by: str
    created_at: datetime
    updated_at: datetime


@dataclass(frozen=True)
class DocumentContent:
    document: Document
    data: bytes


class DocumentFilters(BaseModel):
    q: str = Field(default="", max_length=255)
    folder_id: Reference | None = None
    top_level: bool = False
    archived: bool = False
    asset_id: Reference | None = None
    device_id: Reference | None = None

    @model_validator(mode="after")
    def reject_two_locations(self) -> Self:
        if self.top_level and self.folder_id is not None:
            msg = "Filter by folder_id or top_level, not both."
            raise ValueError(msg)
        return self

    @property
    def spans_folders(self) -> bool:
        """Whether active documents are listed across folders (search, linked cards).

        Such lists leave out what archived folders hide. Browsing one folder, or
        listing the archives, shows documents wherever they are filed.
        """
        return not (self.top_level or self.folder_id is not None or self.archived)

    def matches(
        self, document: Document, hidden_folder_ids: frozenset[str] = frozenset()
    ) -> bool:
        return (
            self.q.lower() in document.name.lower()
            and (self.folder_id is None or document.folder_id == self.folder_id)
            and (not self.top_level or document.folder_id is None)
            and (document.archived_at is not None) == self.archived
            and (self.asset_id is None or self.asset_id in document.asset_ids)
            and (self.device_id is None or self.device_id in document.device_ids)
            and document.folder_id not in hidden_folder_ids
        )


def hidden_folder_ids(folders: Iterable[Folder]) -> frozenset[str]:
    """Return the archived folders and every folder below one of them.

    Archiving a folder hides its whole subtree without touching the descendants'
    own archive state, so restoring the folder brings the view back as it was.
    """
    children: defaultdict[str | None, list[str]] = defaultdict(list)
    pending: list[str] = []
    for folder in folders:
        children[folder.parent_id].append(folder.id)
        if folder.archived_at is not None:
            pending.append(folder.id)
    hidden: set[str] = set()
    while pending:
        folder_id = pending.pop()
        if folder_id not in hidden:
            hidden.add(folder_id)
            pending.extend(children[folder_id])
    return frozenset(hidden)
