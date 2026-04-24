from __future__ import annotations

import logging
from datetime import UTC, datetime
from enum import StrEnum
from typing import TYPE_CHECKING, ClassVar
from uuid import uuid4

from automations.models import TriggerContext
from models.types import AttributeValueType  # noqa: TC001
from pydantic import BaseModel

if TYPE_CHECKING:
    from collections.abc import Awaitable, Callable

    from devices_manager import Attribute, CoreDevice
    from devices_manager.interface import DevicesManagerInterface

logger = logging.getLogger(__name__)


class ConditionOperator(StrEnum):
    GT = "gt"
    LT = "lt"
    GTE = "gte"
    LTE = "lte"
    EQ = "eq"
    NE = "ne"


_COMPARATORS = {
    ConditionOperator.GT: lambda a, b: a > b,
    ConditionOperator.LT: lambda a, b: a < b,
    ConditionOperator.GTE: lambda a, b: a >= b,
    ConditionOperator.LTE: lambda a, b: a <= b,
    ConditionOperator.EQ: lambda a, b: a == b,
    ConditionOperator.NE: lambda a, b: a != b,
}


class Condition(BaseModel):
    operator: ConditionOperator
    threshold: AttributeValueType

    def evaluate(self, value: AttributeValueType | None) -> bool:
        """Return False when value is None or types are incompatible."""
        if value is None:
            return False
        try:
            return _COMPARATORS[self.operator](value, self.threshold)
        except TypeError:
            logger.warning(
                "Condition type error: cannot compare %r %s %r",
                value,
                self.operator,
                self.threshold,
            )
            return False


class ChangeEventTrigger(BaseModel):
    device_id: str
    attribute: str
    condition: Condition | None = None


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
        self._listener_id: str | None = None

    async def start(self) -> None:
        self._listener_id = self._dm.add_device_attribute_listener(self._handle)

    async def stop(self) -> None:
        if self._listener_id is not None:
            self._dm.remove_device_attribute_listener(self._listener_id)

    async def _handle(
        self,
        device: CoreDevice,
        attr_name: str,
        attr: Attribute,
    ) -> None:
        if device.id != self._trigger.device_id:
            return
        if attr_name != self._trigger.attribute:
            return
        if self._trigger.condition is not None and not self._trigger.condition.evaluate(
            attr.current_value
        ):
            return
        await self._on_fire(
            TriggerContext(timestamp=attr.last_updated or datetime.now(UTC))
        )


class ChangeEventTriggerProvider:
    id = "change_event"
    trigger_schema: ClassVar[dict] = ChangeEventTrigger.model_json_schema()

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
