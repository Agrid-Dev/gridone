from __future__ import annotations

from typing import TYPE_CHECKING, ClassVar

from automations.constants import SYSTEM_ACTOR
from pydantic import BaseModel

from models.action_failure import ActionExecutionError, ActionFailure
from models.errors import InvalidError, NotFoundError

if TYPE_CHECKING:
    from commands.interface import CommandsServiceInterface


class CommandAction(BaseModel):
    template_id: str


class CommandsActionProvider:
    id = "command_template"
    params_model: ClassVar[type[BaseModel]] = CommandAction

    def __init__(self, commands_service: CommandsServiceInterface) -> None:
        self._commands_service = commands_service

    async def execute(self, params: dict) -> str | None:
        action = CommandAction(**params)
        template = await self._commands_service.get_template(action.template_id)
        try:
            dispatch = await self._commands_service.dispatch_from_template(
                template_id=action.template_id,
                user_id=SYSTEM_ACTOR,
                confirm=False,
            )
        except (NotFoundError, InvalidError) as exc:
            raise ActionExecutionError(
                ActionFailure(code="invalid_target", target=template.target)
            ) from exc
        if not dispatch.commands:
            raise ActionExecutionError(
                ActionFailure(code="empty_target", target=template.target)
            )
        return dispatch.batch_id
