"""Safe action outcomes that an automation can persist and a UI can localize."""

from typing import Literal

from pydantic import BaseModel


class ActionFailure(BaseModel):
    code: Literal["empty_device_group", "invalid_device_group"]
    group_id: str
    group_name: str | None = None


class ActionExecutionError(Exception):
    def __init__(self, details: ActionFailure) -> None:
        super().__init__("No commands sent to the device group")
        self.details = details
