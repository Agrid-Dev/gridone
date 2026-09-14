"""Tag mutations are independent of drivers and deployment vocabulary."""

from typing import Literal

from pydantic import BaseModel, Field

from models.tags import Tag, Tags


class TagMutation(BaseModel):
    key: Tag
    add: list[Tag] = Field(default_factory=list)
    remove: list[Tag] = Field(default_factory=list)
    require_value: Tag | None = None

    def apply(self, tags: dict[str, list[str]]) -> list[str]:
        current = set(tags.get(self.key, ()))
        if self.require_value is not None and self.require_value not in current:
            return sorted(current)
        return sorted((current - set(self.remove)) | set(self.add))


class TagMutationResult(BaseModel):
    device_id: str
    status: Literal["changed", "unchanged", "failed"]
    tags: Tags | None = None
    error: Literal["not_found", "storage_failure"] | None = None
