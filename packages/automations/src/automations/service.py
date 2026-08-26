from __future__ import annotations

import logging
from datetime import UTC, datetime
from typing import TYPE_CHECKING

from pydantic import ValidationError as PydanticValidationError

from automations.models import (
    Automation,
    AutomationCreate,
    AutomationExecution,
    AutomationUpdate,
    ExecutionStatus,
    TriggerContext,
)
from automations.storage.factory import build_storage
from models.errors import (
    NotFoundError,
    SchemaValidationError,
    ValidationErrorItem,
    validation_error_items,
)
from models.ids import gen_id
from models.service import Service

logger = logging.getLogger(__name__)

if TYPE_CHECKING:
    from collections.abc import Mapping, Sequence

    from automations.models import Action, Trigger
    from automations.protocols import ActionProvider, OnFireCallback, TriggerProvider
    from automations.storage.backend import AutomationsStorageBackend


class AutomationsService(Service):
    _cache: dict[str, Automation]
    _handles: dict[str, tuple[str, str]]  # automation_id → (provider_id, handle_id)
    _storage: AutomationsStorageBackend

    def __init__(
        self,
        storage_url: str | None,
        trigger_providers: Sequence[TriggerProvider],
        action_providers: Sequence[ActionProvider],
    ) -> None:
        self._storage_url = storage_url
        self._providers: dict[str, TriggerProvider] = {
            p.id: p for p in trigger_providers
        }
        self._action_providers: dict[str, ActionProvider] = {
            p.id: p for p in action_providers
        }
        self._cache = {}
        self._handles = {}
        self._started = False

    async def start(self) -> None:
        """Build storage, then register all persisted automations."""
        if self._started:
            return
        self._started = True
        self._storage = await build_storage(self._storage_url)
        await self._storage.start()
        for automation in await self._storage.list():
            await self._register_automation(automation)

    # CRUD

    async def create(self, params: AutomationCreate, *, created_by: str) -> Automation:
        self._validate_trigger(params.trigger)
        self._validate_action(params.action)
        now = datetime.now(UTC)
        automation = Automation(
            id=gen_id(),
            name=params.name,
            description=params.description,
            trigger=params.trigger,
            action=params.action,
            enabled=params.enabled,
            created_at=now,
            updated_at=now,
            created_by=created_by,
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
        if params.trigger is not None:
            self._validate_trigger(params.trigger)
        if params.action is not None:
            self._validate_action(params.action)
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
        return await self.update(automation_id, AutomationUpdate(enabled=True))

    async def disable(self, automation_id: str) -> Automation:
        automation = await self.get(automation_id)
        if not automation.enabled:
            return automation
        return await self.update(automation_id, AutomationUpdate(enabled=False))

    # Execution log

    async def _log_execution(self, execution: AutomationExecution) -> None:
        await self._storage.log_execution(execution)

    async def list_executions(
        self, automation_id: str
    ) -> Sequence[AutomationExecution]:
        return await self._storage.list_executions(automation_id)

    def list_trigger_schemas(self) -> dict[str, dict]:
        return {p.id: p.params_schema for p in self._providers.values()}

    def list_action_schemas(self) -> dict[str, dict]:
        return {p.id: p.params_schema for p in self._action_providers.values()}

    async def stop(self) -> None:
        for automation_id in list(self._handles):
            await self._stop_trigger(automation_id)
        if hasattr(self, "_storage"):
            await self._storage.close()
        self._started = False

    # Helpers

    def _validate_trigger(self, trigger: Trigger) -> None:
        self._validate_provider_params(
            "trigger", trigger.provider_id, trigger.params, self._providers
        )

    def _validate_action(self, action: Action) -> None:
        self._validate_provider_params(
            "action", action.provider_id, action.params, self._action_providers
        )

    @staticmethod
    def _validate_provider_params(
        section: str,
        provider_id: str,
        params: dict,
        providers: Mapping[str, TriggerProvider | ActionProvider],
    ) -> None:
        """Validate ``params`` against the provider's own pydantic model,
        catching custom validators (e.g. cron format) that a JSON schema alone
        would miss, before anything is persisted or registered."""
        provider = providers.get(provider_id)
        if provider is None:
            raise SchemaValidationError(
                [
                    ValidationErrorItem(
                        loc=(section, "provider_id"),
                        msg=f"Unknown provider_id {provider_id!r}",
                        type="value_error",
                    )
                ]
            )
        try:
            provider.validate_params(params)
        except PydanticValidationError as exc:
            raise SchemaValidationError(
                [
                    ValidationErrorItem(
                        loc=(section, "params", *item.loc), msg=item.msg, type=item.type
                    )
                    for item in validation_error_items(exc)
                ]
            ) from exc

    async def _register_automation(self, automation: Automation) -> None:
        self._cache[automation.id] = automation
        if automation.enabled:
            await self._start_trigger(automation)

    async def _start_trigger(self, automation: Automation) -> None:
        if automation.id in self._handles:
            msg = f"Trigger for automation {automation.id!r} is already registered"
            raise RuntimeError(msg)
        provider_id = automation.trigger.provider_id
        provider = self._providers[provider_id]
        on_fire = self._make_on_fire(automation.id)
        handle_id = await provider.register(automation.trigger.params, on_fire)
        self._handles[automation.id] = (provider_id, handle_id)

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
            provider = self._action_providers[automation.action.provider_id]
            output_id = await provider.execute(automation.action.params)
        except Exception:
            logger.exception("Automation %r action failed", automation_id)
            status, error = ExecutionStatus.FAILED, "Action execution failed"
        await self._log_execution(
            AutomationExecution(
                id=gen_id(),
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
