from __future__ import annotations

import logging
from datetime import UTC, datetime
from typing import TYPE_CHECKING, ClassVar
from uuid import uuid4

from automations.models import ChangeEventTrigger, ConditionOperator, TriggerContext

if TYPE_CHECKING:
    from collections.abc import Awaitable, Callable

    from automations.models import Condition
    from devices_manager import Attribute, CoreDevice
    from devices_manager.interface import DevicesManagerInterface
    from models.types import AttributeValueType

logger = logging.getLogger(__name__)

_COMPARATORS = {
    ConditionOperator.GT: lambda a, b: a > b,
    ConditionOperator.LT: lambda a, b: a < b,
    ConditionOperator.GTE: lambda a, b: a >= b,
    ConditionOperator.LTE: lambda a, b: a <= b,
    ConditionOperator.EQ: lambda a, b: a == b,
    ConditionOperator.NE: lambda a, b: a != b,
}


def _evaluate(condition: Condition, value: AttributeValueType | None) -> bool:
    """Evaluate condition.operator against value and condition.threshold.

    Returns False when value is None or types are incompatible.
    """
    if value is None:
        return False
    try:
        return _COMPARATORS[condition.operator](value, condition.threshold)
    except TypeError:
        logger.warning(
            "Condition type error: cannot compare %r %s %r",
            value,
            condition.operator,
            condition.threshold,
        )
        return False


class ChangeEventListener:
    def __init__(
        self,
        trigger: ChangeEventTrigger,
        on_fire: Callable[[TriggerContext], Awaitable[None]],
        devices_manager: DevicesManagerInterface,
    ) -> None:
        self._trigger = trigger
        self._on_fire = on_fire
        self._dm = devices_manager

    async def start(self) -> None:
        self._dm.add_device_attribute_listener(self._handle)

    async def stop(self) -> None:
        self._dm.remove_device_attribute_listener(self._handle)

    async def _handle(
        self,
        device: CoreDevice,
        attr_name: str,
        attr: Attribute,
    ) -> None:
        if device.id != self._trigger.source_id:
            return
        if attr_name != self._trigger.event_type:
            return
        value = attr.current_value
        if self._trigger.condition is not None and not _evaluate(
            self._trigger.condition, value
        ):
            return
        await self._on_fire(
            TriggerContext(
                timestamp=attr.last_updated or datetime.now(UTC),
                value=value,
            )
        )


class ChangeEventTriggerProvider:
    id = "change_event"
    trigger_schema: ClassVar[dict] = {
        "type": "object",
        "properties": {
            "source_id": {"type": "string", "title": "Source device ID"},
            "event_type": {"type": "string", "title": "Attribute name"},
            "condition": {
                "type": "object",
                "properties": {
                    "operator": {
                        "type": "string",
                        "enum": ["gt", "lt", "gte", "lte", "eq", "ne"],
                        "title": "Operator",
                    },
                    "threshold": {"title": "Threshold"},
                },
                "required": ["operator", "threshold"],
            },
        },
        "required": ["source_id", "event_type"],
    }

    def __init__(self, devices_manager: DevicesManagerInterface) -> None:
        self._dm = devices_manager
        self._listeners: dict[str, ChangeEventListener] = {}

    async def register(
        self,
        trigger_params: dict,
        on_fire: Callable[[TriggerContext], Awaitable[None]],
    ) -> str:
        handle_id = uuid4().hex[:16]
        trigger = ChangeEventTrigger(**trigger_params)
        listener = ChangeEventListener(trigger, on_fire, self._dm)
        await listener.start()
        self._listeners[handle_id] = listener
        return handle_id

    async def unregister(self, trigger_id: str) -> None:
        listener = self._listeners.pop(trigger_id, None)
        if listener is not None:
            await listener.stop()
