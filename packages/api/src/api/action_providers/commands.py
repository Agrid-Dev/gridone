from __future__ import annotations

from typing import TYPE_CHECKING, ClassVar

from automations.constants import SYSTEM_ACTOR
from pydantic import BaseModel

if TYPE_CHECKING:
    from commands.interface import CommandsServiceInterface


class CommandAction(BaseModel):
    template_id: str


class CommandsActionProvider:
    id = "command_template"
    params_schema: ClassVar[dict] = CommandAction.model_json_schema()

    def __init__(self, commands_service: CommandsServiceInterface) -> None:
        self._commands_service = commands_service

    async def execute(self, params: dict) -> str | None:
        action = CommandAction(**params)
        dispatch = await self._commands_service.dispatch_from_template(
            template_id=action.template_id,
            user_id=SYSTEM_ACTOR,
            confirm=False,
        )
        return dispatch.batch_id
