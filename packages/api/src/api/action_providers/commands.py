"""Command actions: a saved template, or one inline write on a device."""

from __future__ import annotations

from typing import TYPE_CHECKING, ClassVar

from automations.constants import SYSTEM_ACTOR
from automations.models import AutomationWrite
from pydantic import BaseModel, Field, model_validator

from commands.models import AttributeWrite
from models.action_failure import ActionExecutionError, ActionFailure
from models.errors import InvalidError, NotFoundError
from models.expressions import DeviceAttributeRef, Scalar
from models.ids import gen_id

if TYPE_CHECKING:
    from automations.models import Trigger, TriggerContext

    from commands.interface import CommandsServiceInterface
    from models.attribute_observation import AttributeInspector


class CommandAction(BaseModel):
    """A saved template, or one inline write.

    ``template_id`` dispatches the template to its saved target. Otherwise
    ``attribute`` and a static ``value`` are written to ``device_id``, or to the
    triggering event's device when ``device_id`` is omitted.
    """

    template_id: str | None = Field(default=None, min_length=1)
    device_id: str | None = Field(default=None, min_length=1)
    attribute: str | None = Field(default=None, min_length=1)
    value: Scalar | None = None

    @model_validator(mode="after")
    def one_shape(self) -> CommandAction:
        inline = (self.device_id, self.attribute, self.value)
        if self.template_id is not None:
            if any(field is not None for field in inline):
                msg = "command_action_is_a_template_or_an_inline_write"
                raise ValueError(msg)
        elif self.attribute is None or self.value is None:
            msg = "command_action_requires_a_template_or_an_inline_write"
            raise ValueError(msg)
        return self


class CommandsActionProvider:
    id = "command_template"
    params_model: ClassVar[type[BaseModel]] = CommandAction

    def __init__(
        self,
        commands_service: CommandsServiceInterface,
        inspect_attribute: AttributeInspector,
    ) -> None:
        self._commands_service = commands_service
        self._inspect = inspect_attribute

    async def describe_writes(
        self, params: dict, trigger: Trigger
    ) -> list[AutomationWrite]:
        action = CommandAction(**params)
        if action.template_id is None:
            device_id = action.device_id or trigger.params.get("device_id")
            if not isinstance(device_id, str) or action.attribute is None:
                return []
            return [
                AutomationWrite(
                    device_id=device_id, attribute=action.attribute, value=action.value
                )
            ]
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
        if action.template_id is None:
            return await self._write_inline(action, context)
        template = await self._commands_service.get_template(action.template_id)
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

    async def _write_inline(
        self, action: CommandAction, context: TriggerContext | None
    ) -> str:
        """Resolve the target's declared type, then dispatch: no retry, no consent."""
        device_id = action.device_id or (context.device_id if context else None)
        attribute, value = action.attribute, action.value
        if device_id is None:
            msg = "Action requires an event device or an explicit device"
            raise InvalidError(msg)
        if attribute is None or value is None:  # excluded by the model validator
            msg = "Inline write requires an attribute and a value"
            raise InvalidError(msg)
        definition = self._inspect(
            DeviceAttributeRef(device_id=device_id, attribute=attribute)
        )
        if definition is None or not definition.writable:
            msg = "Automation write target is unavailable"
            raise InvalidError(msg)
        batch_id = gen_id()
        await self._commands_service.dispatch_unit(
            device_id=device_id,
            write=AttributeWrite(
                attribute=attribute, value=value, data_type=definition.data_type
            ),
            user_id=SYSTEM_ACTOR,
            confirm=False,
            batch_id=batch_id,
        )
        return batch_id
