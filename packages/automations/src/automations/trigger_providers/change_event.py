from __future__ import annotations

import logging
from datetime import UTC, datetime
from typing import TYPE_CHECKING

from automations.models import ChangeEventTrigger, ConditionOperator, TriggerContext

if TYPE_CHECKING:
    from collections.abc import Awaitable, Callable

    from automations.models import Condition
    from automations.protocols import AttributeEventBus
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
        event_bus: AttributeEventBus,
    ) -> None:
        self._trigger = trigger
        self._on_fire = on_fire
        self._event_bus = event_bus

    async def start(self) -> None:
        self._event_bus.subscribe(self._handle)

    async def stop(self) -> None:
        self._event_bus.unsubscribe(self._handle)

    async def _handle(
        self,
        source_id: str,
        event_type: str,
        value: AttributeValueType | None,
        timestamp: datetime | None,
    ) -> None:
        wrong_source = source_id != self._trigger.source_id
        wrong_event = event_type != self._trigger.event_type
        if wrong_source or wrong_event:
            return
        if self._trigger.condition is not None and not _evaluate(
            self._trigger.condition, value
        ):
            return
        await self._on_fire(
            TriggerContext(
                timestamp=timestamp or datetime.now(UTC),
                value=value,
            )
        )


class ChangeEventTriggerProvider:
    def __init__(self, event_bus: AttributeEventBus) -> None:
        self._event_bus = event_bus

    def build(
        self,
        trigger: ChangeEventTrigger,
        on_fire: Callable[[TriggerContext], Awaitable[None]],
    ) -> ChangeEventListener:
        return ChangeEventListener(trigger, on_fire, self._event_bus)
