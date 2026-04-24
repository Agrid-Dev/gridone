from __future__ import annotations

from typing import TYPE_CHECKING, Protocol

if TYPE_CHECKING:
    from collections.abc import Awaitable, Callable

    from automations.models import TriggerContext

    OnFireCallback = Callable[[TriggerContext], Awaitable[None]]


class TriggerProvider(Protocol):
    """Manages the lifecycle of a trigger type.

    Each provider owns one class of trigger (e.g. schedule, change_event).
    The service dispatches register/unregister calls to the matching provider
    based on the trigger's ``type`` field.
    """

    id: str
    trigger_schema: dict

    async def register(
        self,
        trigger_params: dict,
        on_fire: OnFireCallback,
    ) -> str:
        """Activate a trigger. Returns an opaque handle used to unregister."""
        ...

    async def unregister(self, trigger_id: str) -> None:
        """Deactivate a previously registered trigger."""
        ...


class ActionServiceInterface(Protocol):
    async def execute(self, template_id: str) -> str: ...
