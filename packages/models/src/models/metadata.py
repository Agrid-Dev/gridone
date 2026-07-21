from datetime import UTC, datetime
from typing import Self

from pydantic import BaseModel, Field


class ResourceMetadata(BaseModel):
    """Auditability timestamps shared by every resource's read model."""

    created_at: datetime = Field(default_factory=lambda: datetime.now(UTC))
    updated_at: datetime = Field(default_factory=lambda: datetime.now(UTC))

    def touch_updated_at(self) -> Self:
        return self.model_copy(update={"updated_at": datetime.now(UTC)})
