from __future__ import annotations

from typing import TYPE_CHECKING

from models.errors import NotFoundError

if TYPE_CHECKING:
    from automations.models import Automation, AutomationExecution


class MemoryAutomationsStorage:
    """In-memory automations storage backend."""

    def __init__(self) -> None:
        self._automations: dict[str, Automation] = {}
        self._executions: dict[str, list[AutomationExecution]] = {}

    async def create(self, automation: Automation) -> None:
        self._automations[automation.id] = automation

    async def get(self, automation_id: str) -> Automation:
        automation = self._automations.get(automation_id)
        if automation is None:
            msg = f"Automation {automation_id!r} not found"
            raise NotFoundError(msg)
        return automation

    async def list(self, *, enabled: bool | None = None) -> list[Automation]:  # type: ignore[invalid-type-form]
        automations = list(self._automations.values())
        if enabled is None:
            return automations
        return [a for a in automations if a.enabled == enabled]

    async def update(self, automation: Automation) -> None:
        if automation.id not in self._automations:
            msg = f"Automation {automation.id!r} not found"
            raise NotFoundError(msg)
        self._automations[automation.id] = automation

    async def delete(self, automation_id: str) -> None:
        if automation_id not in self._automations:
            msg = f"Automation {automation_id!r} not found"
            raise NotFoundError(msg)
        del self._automations[automation_id]
        self._executions.pop(automation_id, None)

    async def log_execution(self, execution: AutomationExecution) -> None:
        self._executions.setdefault(execution.automation_id, []).append(execution)

    async def list_executions(self, automation_id: str) -> list[AutomationExecution]:  # type: ignore[invalid-type-form]
        executions = list(self._executions.get(automation_id, []))
        executions.sort(key=lambda e: e.triggered_at, reverse=True)
        return executions

    async def start(self) -> None:
        return None

    async def close(self) -> None:
        return None
