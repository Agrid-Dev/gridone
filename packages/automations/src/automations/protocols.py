from __future__ import annotations

from typing import TYPE_CHECKING, Protocol

if TYPE_CHECKING:
    from collections.abc import Awaitable, Callable
    from datetime import datetime

    from automations.models import Trigger, TriggerContext
    from models.types import AttributeValueType

    AttributeEventHandler = Callable[
        [str, str, AttributeValueType | None, datetime | None],
        Awaitable[None],
    ]


class AttributeEventBus(Protocol):
    """Generic pub/sub for attribute change events.

    source_id and event_type map to device_id and attribute name in DM.
    """

    def subscribe(self, handler: AttributeEventHandler) -> None: ...

    def unsubscribe(self, handler: AttributeEventHandler) -> None: ...


class TriggerListener(Protocol):
    async def start(self) -> None: ...

    async def stop(self) -> None: ...


class TriggerListenerFactory(Protocol):
    def build(
        self,
        trigger: Trigger,
        on_fire: Callable[[TriggerContext], Awaitable[None]],
    ) -> TriggerListener: ...


class ActionServiceInterface(Protocol):
    async def execute(self, template_id: str) -> str: ...

    # Returns the provider output id (e.g. BatchCommand id) stored on
    # AutomationExecution.output_id.
