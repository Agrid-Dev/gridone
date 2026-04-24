from __future__ import annotations

from typing import TYPE_CHECKING, Protocol

if TYPE_CHECKING:
    from collections.abc import Awaitable, Callable, Sequence
    from typing import Any

    from automations.models import (
        Automation,
        AutomationCreate,
        AutomationExecution,
        AutomationUpdate,
        TriggerContext,
    )

    OnFireCallback = Callable[[TriggerContext], Awaitable[None]]
    ActionDispatcher = Callable[..., Awaitable[Any]]


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


class AutomationsServiceInterface(Protocol):
    async def create(self, params: AutomationCreate) -> Automation: ...
    async def get(self, automation_id: str) -> Automation: ...
    async def list(self, *, enabled: bool | None = None) -> Sequence[Automation]: ...
    async def update(
        self, automation_id: str, params: AutomationUpdate
    ) -> Automation: ...
    async def delete(self, automation_id: str) -> None: ...
    async def enable(self, automation_id: str) -> Automation: ...
    async def disable(self, automation_id: str) -> Automation: ...
    async def list_executions(
        self, automation_id: str
    ) -> Sequence[AutomationExecution]: ...
    def list_trigger_schemas(self) -> Sequence[dict]: ...
