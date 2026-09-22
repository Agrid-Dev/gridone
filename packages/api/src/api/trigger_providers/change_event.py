from __future__ import annotations

import logging
from datetime import UTC, datetime
from enum import StrEnum
from typing import TYPE_CHECKING, ClassVar

from automations.models import TriggerContext
from pydantic import BaseModel

from models.ids import gen_id
from models.types import AttributeValueType

if TYPE_CHECKING:
    from collections.abc import Awaitable, Callable

    from devices_manager import Attribute, CoreDevice
    from devices_manager.interface import DevicesServiceInterface

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
        devices_manager: DevicesServiceInterface,
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
        previous: Attribute | None,
        attr: Attribute,
    ) -> None:
        if device.id != self._trigger.device_id:
            return
        if attr_name != self._trigger.attribute:
            return
        initial = attr.is_initial_observation is True
        if (
            not initial
            and self._trigger.condition is not None
            and not self._trigger.condition.evaluate(attr.current_value)
        ):
            return
        await self._on_fire(
            TriggerContext(
                timestamp=attr.last_updated or datetime.now(UTC),
                device_id=device.id,
                attribute=attr_name,
                previous_value=previous.current_value if previous is not None else None,
                value=attr.current_value,
                has_previous=previous is not None and not initial,
                is_initial=initial,
            )
        )


class ChangeEventTriggerProvider:
    id = "change_event"
    params_model: ClassVar[type[BaseModel]] = ChangeEventTrigger

    def __init__(self, devices_manager: DevicesServiceInterface) -> None:
        self._dm = devices_manager
        self._listeners: dict[str, ChangeEventListener] = {}
        self._by_point: dict[tuple[str, str], dict[str, ChangeEventListener]] = {}
        self._listener_id: str | None = None

    async def _dispatch(
        self,
        device: CoreDevice,
        attr_name: str,
        previous: Attribute | None,
        attr: Attribute,
    ) -> None:
        """One fleet subscription, with constant-time lookup before evaluating rules."""
        for listener in tuple(self._by_point.get((device.id, attr_name), {}).values()):
            try:
                await listener._handle(device, attr_name, previous, attr)  # noqa: SLF001 -- provider owns listeners
            except Exception:
                logger.exception(
                    "Automation listener failed for %s/%s", device.id, attr_name
                )

    async def register(
        self,
        params: dict,
        on_fire: Callable[[TriggerContext], Awaitable[None]],
    ) -> str:
        handle_id = gen_id()
        trigger = ChangeEventTrigger(**params)
        listener = ChangeEventListener(trigger, on_fire, self._dm)
        if self._listener_id is None:
            self._listener_id = self._dm.add_device_attribute_listener(self._dispatch)
        self._listeners[handle_id] = listener
        self._by_point.setdefault((trigger.device_id, trigger.attribute), {})[
            handle_id
        ] = listener
        return handle_id

    async def unregister(self, trigger_id: str) -> None:
        listener = self._listeners.pop(trigger_id, None)
        if listener is not None:
            key = (listener._trigger.device_id, listener._trigger.attribute)  # noqa: SLF001 -- provider owns listeners
            bucket = self._by_point[key]
            bucket.pop(trigger_id)
            if not bucket:
                self._by_point.pop(key)
        if not self._listeners and self._listener_id is not None:
            self._dm.remove_device_attribute_listener(self._listener_id)
            self._listener_id = None
