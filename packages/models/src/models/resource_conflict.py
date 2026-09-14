"""Safe, structured business errors with actionable resource references."""

from enum import StrEnum
from typing import Literal

from pydantic import BaseModel

from models.errors import ConflictError


class ResourceConflictCode(StrEnum):
    COMMAND_PREVIEW_REQUIRED = "command_preview_required"
    COMMAND_PREVIEW_EXPIRED = "command_preview_expired"
    COMMAND_PREVIEW_CHANGED = "command_preview_changed"


class RelatedResource(BaseModel):
    kind: Literal["device", "driver", "automation", "command_template"]
    id: str
    name: str


class ResourceConflictError(ConflictError):
    def __init__(
        self, code: ResourceConflictCode, resources: list[RelatedResource]
    ) -> None:
        super().__init__("Command preview must be refreshed before this operation")
        self.code = code
        self.resources = resources
