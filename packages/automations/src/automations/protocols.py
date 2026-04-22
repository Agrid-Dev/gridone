from __future__ import annotations

from typing import TYPE_CHECKING, Protocol

if TYPE_CHECKING:
    from collections.abc import Awaitable, Callable

    from automations.models import Trigger, TriggerContext


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
    async def execute(self, template_id: str, user_id: str) -> str: ...

    # Returns the provider output id (e.g. BatchCommand id) stored on
    # AutomationExecution.output_id.
