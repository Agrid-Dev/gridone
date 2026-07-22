from datetime import UTC, datetime
from typing import Self

from pydantic import BaseModel, Field


class ResourceMetadata(BaseModel):
    """Auditability timestamps shared by every resource's read model."""

    created_at: datetime = Field(default_factory=lambda: datetime.now(UTC))
    updated_at: datetime = Field(default_factory=lambda: datetime.now(UTC))

    def touch_updated_at(self, **extra: object) -> Self:
        """Copy with a fresh updated_at, merging any other field updates in."""
        return self.model_copy(update={**extra, "updated_at": datetime.now(UTC)})


def timestamp_kwargs(
    created_at: datetime | None, updated_at: datetime | None
) -> dict[str, datetime]:
    """Build a kwargs dict from optional timestamps, omitting unset ones so
    the receiving model's own defaults win instead of being overridden with
    None."""
    kwargs: dict[str, datetime] = {}
    if created_at is not None:
        kwargs["created_at"] = created_at
    if updated_at is not None:
        kwargs["updated_at"] = updated_at
    return kwargs
