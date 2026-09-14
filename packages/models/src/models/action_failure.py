"""Safe action outcomes that an automation can persist and a UI can localize."""

from typing import Literal

from pydantic import BaseModel

from models.targets import DevicesFilter


class ActionFailure(BaseModel):
    code: Literal["empty_target", "invalid_target"]
    target: DevicesFilter


class ActionExecutionError(Exception):
    def __init__(self, details: ActionFailure) -> None:
        super().__init__("No commands sent to the target")
        self.details = details
