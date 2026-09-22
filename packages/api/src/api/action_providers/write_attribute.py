"""Direct automation writes use the ordinary, protected command path."""

from __future__ import annotations

from typing import TYPE_CHECKING, ClassVar

from automations.constants import SYSTEM_ACTOR
from automations.errors import AutomationLoopError
from automations.models import AutomationWrite
from pydantic import BaseModel, Field, model_validator

from commands.models import AttributeWrite
from models.conditions import EvaluationContext
from models.errors import InvalidError
from models.expressions import (
    MAX_ATTRIBUTE_OPERATIONS,
    MAX_EXPRESSION_DEPTH,
    AttributeRef,
    CandidateRef,
    DeviceAttributeRef,
    Expression,
    expression_nodes,
)
from models.ids import gen_id

if TYPE_CHECKING:
    from automations.models import Trigger, TriggerContext

    from commands.interface import CommandsServiceInterface
    from models.attribute_observation import AttributeInspector, AttributeResolver
    from models.types import AttributeValueType


class WriteAttributeAction(BaseModel):
    # Omitted device_id means the device identified by the triggering event.
    device_id: str | None = Field(default=None, min_length=1)
    attribute: str = Field(min_length=1)
    value: Expression

    @model_validator(mode="after")
    def bounded_value(self) -> WriteAttributeAction:
        """Use the shared expression limits for computed action values too."""
        for count, (_, node, depth) in enumerate(expression_nodes(self.value), 1):
            if depth > MAX_EXPRESSION_DEPTH or count > MAX_ATTRIBUTE_OPERATIONS:
                msg = "automation_expression_limit"
                raise ValueError(msg)
            if isinstance(node, AttributeRef | CandidateRef):
                msg = "automation_requires_device_or_event_reference"
                raise ValueError(msg)  # noqa: TRY004 -- pydantic validation error
        return self


class WriteAttributeActionProvider:
    id = "write_attribute"
    params_model: ClassVar[type[BaseModel]] = WriteAttributeAction

    def __init__(
        self,
        commands: CommandsServiceInterface,
        inspect_attribute: AttributeInspector,
        resolve_attribute: AttributeResolver,
    ) -> None:
        self._commands = commands
        self._inspect = inspect_attribute
        self._resolve = resolve_attribute

    async def describe_writes(
        self, params: dict, trigger: Trigger
    ) -> list[AutomationWrite]:
        action = WriteAttributeAction(**params)
        device_id = action.device_id or trigger.params.get("device_id")
        if not isinstance(device_id, str):
            return []
        value = (
            action.value if isinstance(action.value, str | bool | int | float) else None
        )
        return [
            AutomationWrite(
                device_id=device_id, attribute=action.attribute, value=value
            )
        ]

    async def execute(self, params: dict, context: TriggerContext) -> str:
        """Resolve a typed target and value, then dispatch without retry or consent."""
        action = WriteAttributeAction(**params)
        device_id = action.device_id or context.device_id
        if device_id is None:
            msg = "Action requires an event device or an explicit device"
            raise InvalidError(msg)
        if device_id == context.device_id and action.attribute == context.attribute:
            msg = "direct_feedback"
            raise AutomationLoopError(msg)
        reference = DeviceAttributeRef(device_id=device_id, attribute=action.attribute)
        definition = self._inspect(reference)
        if definition is None or not definition.writable:
            msg = "Automation write target is unavailable"
            raise InvalidError(msg)

        def resolve(ref: DeviceAttributeRef) -> AttributeValueType | None:
            observation = self._resolve(ref)
            return observation.value if observation.validity == "known" else None

        value = EvaluationContext(
            lambda _: None, resolve_attribute=resolve, resolve_event=context.event_value
        ).value(action.value)
        if value is None:
            msg = "Automation write value is unknown"
            raise InvalidError(msg)
        batch_id = gen_id()
        await self._commands.dispatch_unit(
            device_id=device_id,
            write=AttributeWrite(
                attribute=action.attribute, value=value, data_type=definition.data_type
            ),
            user_id=SYSTEM_ACTOR,
            confirm=False,
            batch_id=batch_id,
        )
        return batch_id
