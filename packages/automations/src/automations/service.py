from __future__ import annotations

import logging
from datetime import UTC, datetime
from typing import TYPE_CHECKING
from uuid import uuid4

from automations.models import (
    Automation,
    AutomationCreate,
    AutomationExecution,
    AutomationUpdate,
    ExecutionStatus,
    TriggerContext,
)
from models.errors import NotFoundError

logger = logging.getLogger(__name__)

if TYPE_CHECKING:
    from collections.abc import Sequence

    from automations.protocols import (
        ActionServiceInterface,
        OnFireCallback,
        TriggerProvider,
    )
    from automations.storage.backend import AutomationsStorageBackend


class AutomationsService:
    _cache: dict[str, Automation]
    _handles: dict[str, tuple[str, str]]  # automation_id → (provider_id, handle_id)

    def __init__(
        self,
        storage: AutomationsStorageBackend,
        trigger_providers: Sequence[TriggerProvider],
        actions: ActionServiceInterface,
    ) -> None:
        self._storage = storage
        self._providers: dict[str, TriggerProvider] = {
            p.id: p for p in trigger_providers
        }
        self._actions = actions
        self._cache = {}
        self._handles = {}

    async def start(self) -> None:
        """Start storage and register all persisted automations."""
        await self._storage.start()
        for automation in await self._storage.list():
            await self._register_automation(automation)

    # CRUD

    async def create(self, params: AutomationCreate) -> Automation:
        automation = Automation(
            id=uuid4().hex[:16],
            name=params.name,
            trigger=params.trigger,
            action_template_id=params.action_template_id,
            enabled=params.enabled,
        )
        await self._storage.create(automation)
        await self._register_automation(automation)
        return automation

    async def get(self, automation_id: str) -> Automation:
        automation = self._cache.get(automation_id)
        if automation is None:
            msg = f"Automation {automation_id!r} not found"
            raise NotFoundError(msg)
        return automation

    async def list(self, *, enabled: bool | None = None) -> Sequence[Automation]:
        automations = list(self._cache.values())
        if enabled is None:
            return automations
        return [a for a in automations if a.enabled == enabled]

    async def update(self, automation_id: str, params: AutomationUpdate) -> Automation:
        existing = await self.get(automation_id)
        trigger_changed = (
            params.trigger is not None and params.trigger != existing.trigger
        )
        was_enabled = existing.enabled
        updated = existing.apply_update(params)

        # Stop before storage write — prevents trigger firing against stale config.
        if was_enabled and (not updated.enabled or trigger_changed):
            await self._stop_trigger(automation_id)

        await self._storage.update(updated)
        self._cache[automation_id] = updated

        if updated.enabled and (not was_enabled or trigger_changed):
            await self._start_trigger(updated)

        return updated

    async def delete(self, automation_id: str) -> None:
        await self.get(automation_id)
        await self._stop_trigger(automation_id)
        await self._storage.delete(automation_id)
        self._cache.pop(automation_id)

    # Enable / disable

    async def enable(self, automation_id: str) -> Automation:
        automation = await self.get(automation_id)
        if automation.enabled:
            return automation
        updated = automation.model_copy(update={"enabled": True})
        await self._storage.update(updated)
        self._cache[automation_id] = updated
        await self._start_trigger(updated)
        return updated

    async def disable(self, automation_id: str) -> Automation:
        automation = await self.get(automation_id)
        if not automation.enabled:
            return automation
        await self._stop_trigger(automation_id)
        updated = automation.model_copy(update={"enabled": False})
        await self._storage.update(updated)
        self._cache[automation_id] = updated
        return updated

    # Execution log

    async def _log_execution(self, execution: AutomationExecution) -> None:
        await self._storage.log_execution(execution)

    async def list_executions(
        self, automation_id: str
    ) -> Sequence[AutomationExecution]:
        return await self._storage.list_executions(automation_id)

    async def close(self) -> None:
        for automation_id in list(self._handles):
            await self._stop_trigger(automation_id)
        await self._storage.close()

    # Helpers

    async def _register_automation(self, automation: Automation) -> None:
        self._cache[automation.id] = automation
        if automation.enabled:
            await self._start_trigger(automation)

    async def _start_trigger(self, automation: Automation) -> None:
        trigger_type = automation.trigger.type
        provider = self._providers[trigger_type]
        trigger_params = automation.trigger.model_dump(exclude={"type"})
        on_fire = self._make_on_fire(automation.id)
        handle_id = await provider.register(trigger_params, on_fire)
        self._handles[automation.id] = (trigger_type, handle_id)

    async def _stop_trigger(self, automation_id: str) -> None:
        handle = self._handles.pop(automation_id, None)
        if handle is not None:
            provider_id, trigger_id = handle
            await self._providers[provider_id].unregister(trigger_id)

    async def _execute_automation_actions(
        self, automation_id: str, context: TriggerContext
    ) -> None:
        automation = self._cache.get(automation_id)
        if automation is None:
            msg = f"Automation {automation_id!r} not found"
            raise NotFoundError(msg)
        output_id, status, error = None, ExecutionStatus.SUCCESS, None
        try:
            output_id = await self._actions.execute(automation.action_template_id)
        except Exception:
            logger.exception("Automation %r action failed", automation_id)
            status, error = ExecutionStatus.FAILED, "Action execution failed"
        await self._log_execution(
            AutomationExecution(
                id=uuid4().hex[:16],
                automation_id=automation_id,
                triggered_at=context.timestamp,
                executed_at=datetime.now(UTC),
                status=status,
                error=error,
                output_id=output_id,
            )
        )

    def _make_on_fire(self, automation_id: str) -> OnFireCallback:
        async def on_fire(context: TriggerContext) -> None:
            await self._execute_automation_actions(automation_id, context)

        return on_fire
