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


class DocumentCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    name: Name
    asset_ids: References = Field(default_factory=list)
    device_ids: References = Field(default_factory=list)


class DocumentUpdate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    name: Name | None = None
    asset_ids: References | None = None
    device_ids: References | None = None

    @model_validator(mode="after")
    def reject_explicit_nulls(self) -> Self:
        if any(getattr(self, key) is None for key in self.model_fields_set):
            msg = "Document fields cannot be null; use [] to clear links."
            raise ValueError(msg)
        return self


class Document(DocumentCreate):
    id: str
    filename: str
    media_type: str
    size: int
    created_by: str
    created_at: datetime
    updated_at: datetime


@dataclass(frozen=True)
class DocumentContent:
    document: Document
    data: bytes


class DocumentFilters(BaseModel):
    q: str = Field(default="", max_length=255)
    asset_id: Reference | None = None
    device_id: Reference | None = None

    def matches(self, document: Document) -> bool:
        return (
            self.q.lower() in document.name.lower()
            and (self.asset_id is None or self.asset_id in document.asset_ids)
            and (self.device_id is None or self.device_id in document.device_ids)
        )
