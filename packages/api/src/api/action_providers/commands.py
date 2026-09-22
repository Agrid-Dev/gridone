from __future__ import annotations

from typing import TYPE_CHECKING, ClassVar

from automations.constants import SYSTEM_ACTOR
from automations.errors import AutomationLoopError
from automations.models import AutomationWrite
from pydantic import BaseModel

from models.action_failure import ActionExecutionError, ActionFailure
from models.errors import InvalidError, NotFoundError

if TYPE_CHECKING:
    from automations.models import Trigger, TriggerContext

    from commands.interface import CommandsServiceInterface


class CommandAction(BaseModel):
    template_id: str


class CommandsActionProvider:
    id = "command_template"
    params_model: ClassVar[type[BaseModel]] = CommandAction

    def __init__(self, commands_service: CommandsServiceInterface) -> None:
        self._commands_service = commands_service

    async def describe_writes(
        self,
        params: dict,
        trigger: Trigger,  # noqa: ARG002 -- provider contract
    ) -> list[AutomationWrite]:
        action = CommandAction(**params)
        try:
            template = await self._commands_service.get_template(action.template_id)
        except NotFoundError:
            return []
        return [
            AutomationWrite(
                device_id=device_id,
                attribute=template.write.attribute,
                value=template.write.value,
            )
            for device_id in template.target.ids or []
        ]

    async def execute(
        self, params: dict, context: TriggerContext | None = None
    ) -> str | None:
        action = CommandAction(**params)
        template = await self._commands_service.get_template(action.template_id)
        if (
            context is not None
            and context.device_id is not None
            and template.write.attribute == context.attribute
            and template.target.ids is not None
            and context.device_id in template.target.ids
        ):
            msg = "direct_feedback"
            raise AutomationLoopError(msg)
        try:
            dispatch = await self._commands_service.dispatch_template(
                template=template,
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
