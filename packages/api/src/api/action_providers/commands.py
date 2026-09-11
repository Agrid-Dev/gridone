from __future__ import annotations

from typing import TYPE_CHECKING, ClassVar

from automations.constants import SYSTEM_ACTOR
from pydantic import BaseModel

from models.action_failure import ActionExecutionError, ActionFailure
from models.errors import InvalidError, NotFoundError

if TYPE_CHECKING:
    from commands.interface import CommandsServiceInterface
    from devices_manager import DevicesServiceInterface


class CommandAction(BaseModel):
    template_id: str


class CommandsActionProvider:
    id = "command_template"
    params_model: ClassVar[type[BaseModel]] = CommandAction

    def __init__(
        self,
        commands_service: CommandsServiceInterface,
        devices_service: DevicesServiceInterface | None = None,
    ) -> None:
        self._devices_service = devices_service
        self._commands_service = commands_service

    async def execute(self, params: dict) -> str | None:
        action = CommandAction(**params)
        template = await self._commands_service.get_template(action.template_id)
        group_id = template.target.group_id
        group_name = None
        if group_id is not None and self._devices_service is not None:
            try:
                group_name = self._devices_service.get_group(group_id).name
            except NotFoundError as exc:
                raise ActionExecutionError(
                    ActionFailure(code="invalid_device_group", group_id=group_id)
                ) from exc
        try:
            dispatch = await self._commands_service.dispatch_from_template(
                template_id=action.template_id,
                user_id=SYSTEM_ACTOR,
                confirm=False,
            )
        except (NotFoundError, InvalidError) as exc:
            if group_id is None:
                raise
            raise ActionExecutionError(
                ActionFailure(
                    code="invalid_device_group",
                    group_id=group_id,
                    group_name=group_name,
                )
            ) from exc
        if group_id is not None and not dispatch.commands:
            raise ActionExecutionError(
                ActionFailure(
                    code="empty_device_group", group_id=group_id, group_name=group_name
                )
            )
        return dispatch.batch_id
