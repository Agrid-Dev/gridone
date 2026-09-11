"""Safe, structured business errors with actionable resource references."""

from enum import StrEnum
from typing import Literal

from pydantic import BaseModel

from models.errors import ConflictError


class ResourceConflictCode(StrEnum):
    GROUP_REFERENCES = "group_references"
    GROUP_INCOMPATIBLE_MEMBER = "group_incompatible_member"
    DRIVER_GROUP_REFERENCES = "driver_group_references"
    DEVICE_GROUP_DRIVER_CHANGE = "device_group_driver_change"
    GROUP_PREVIEW_REQUIRED = "group_preview_required"
    GROUP_PREVIEW_EXPIRED = "group_preview_expired"
    GROUP_PREVIEW_CHANGED = "group_preview_changed"


class RelatedResource(BaseModel):
    kind: Literal["device", "driver", "device_group", "automation", "command_template"]
    id: str
    name: str


class ResourceConflictError(ConflictError):
    def __init__(
        self, code: ResourceConflictCode, resources: list[RelatedResource]
    ) -> None:
        super().__init__("Resource references must be updated before this operation")
        self.code = code
        self.resources = resources
