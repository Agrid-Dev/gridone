from __future__ import annotations

import logging
from collections import deque
from datetime import UTC, datetime
from time import monotonic
from typing import TYPE_CHECKING

from pydantic import ValidationError as PydanticValidationError

from automations.constants import SYSTEM_ACTOR
from automations.diagnostics import diagnose
from automations.errors import AutomationLoopError
from automations.evaluation import select_branch
from automations.models import (
    Automation,
    AutomationCreate,
    AutomationExecution,
    AutomationSuspension,
    AutomationUpdate,
    ExecutionStatus,
    TriggerContext,
)
from automations.storage.factory import build_storage
from models.action_failure import ActionExecutionError
from models.conditions import EvaluationLimitError
from models.errors import (
    InvalidError,
    NotFoundError,
    SchemaValidationError,
    ValidationErrorItem,
    WriteRejectedError,
    validation_error_items,
)
from models.ids import gen_id
from models.service import Service

logger = logging.getLogger(__name__)

if TYPE_CHECKING:
    from collections.abc import Mapping, Sequence

    from automations.models import Action, AutomationDiagnostic, Trigger
    from automations.protocols import ActionProvider, OnFireCallback, TriggerProvider
    from automations.storage.backend import AutomationsStorageBackend
    from models.attribute_observation import AttributeResolver


class AutomationsService(Service):
    _cache: dict[str, Automation]
    _handles: dict[str, tuple[str, str]]  # automation_id → (provider_id, handle_id)
    _storage: AutomationsStorageBackend

    def __init__(
        self,
        storage_url: str | None,
        trigger_providers: Sequence[TriggerProvider],
        action_providers: Sequence[ActionProvider],
        *,
        resolve_attribute: AttributeResolver | None = None,
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
        self._resolve_attribute = resolve_attribute
        self._running: set[str] = set()
        self._recent: dict[str, deque[float]] = {}
        self._failures: dict[str, int] = {}

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
        for branch in params.branches:
            self._validate_action(branch.action)
        now = datetime.now(UTC)
        automation = Automation(
            id=gen_id(),
            name=params.name,
            description=params.description,
            trigger=params.trigger,
            action=params.branches[0].action,
            branches=params.branches,
            guardrails=params.guardrails,
            max_age_seconds=params.max_age_seconds,
            enabled=params.enabled,
            created_at=now,
            updated_at=now,
            created_by=created_by,
        )
        # Cache before starting the trigger so a listener that fires
        # immediately on registration can still find the automation.
        self._cache[automation.id] = automation
        try:
            if automation.enabled:
                await self._start_trigger(automation)
            await self._storage.create(automation)
        except Exception:
            if automation.enabled:
                await self._stop_trigger(automation.id)
            del self._cache[automation.id]
            raise
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
        self._validate_update(params)
        trigger_changed = (
            params.trigger is not None and params.trigger != existing.trigger
        )
        was_enabled = existing.enabled
        updated = self._apply_update(existing, params)
        need_stop = was_enabled and (not updated.enabled or trigger_changed)
        need_start = updated.enabled and (not was_enabled or trigger_changed)

        # Stop before storage write — prevents trigger firing against stale config.
        if need_stop:
            await self._stop_trigger(automation_id)

        # Start before storage write too — a registration failure must not
        # leave a persisted automation with no listener.
        try:
            if need_start:
                await self._start_trigger(updated)
            await self._storage.update(updated)
        except Exception:
            if need_start:
                await self._stop_trigger(automation_id)
            if need_stop:
                await self._restore_trigger(automation_id, existing)
            raise
        self._cache[automation_id] = updated
        return updated

    def _validate_update(self, params: AutomationUpdate) -> None:
        if params.trigger is not None:
            self._validate_trigger(params.trigger)
        if params.action is not None:
            self._validate_action(params.action)
        if params.branches is not None:
            for branch in params.branches:
                self._validate_action(branch.action)

    @staticmethod
    def _apply_update(existing: Automation, params: AutomationUpdate) -> Automation:
        try:
            updated = existing.apply_update(params)
        except ValueError as exc:
            msg = "Invalid automation update"
            raise InvalidError(msg) from exc
        if updated.enabled and existing.suspension is not None:
            msg = "Resume the suspended automation explicitly"
            raise InvalidError(msg)
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
        if automation.suspension is not None:
            resumed = automation.touch_updated_at(enabled=True, suspension=None)
            await self._storage.update(resumed)
            self._cache[automation_id] = resumed
            try:
                await self._start_trigger(resumed)
            except Exception:
                self._cache[automation_id] = automation
                await self._storage.update(automation)
                raise
            self._recent.pop(automation_id, None)
            self._failures.pop(automation_id, None)
            return resumed
        return await self.update(automation_id, AutomationUpdate(enabled=True))

    async def disable(self, automation_id: str) -> Automation:
        automation = await self.get(automation_id)
        if not automation.enabled:
            return automation
        return await self.update(automation_id, AutomationUpdate(enabled=False))

    async def suspend(
        self, automation_id: str, *, reason: str, actor_id: str
    ) -> Automation:
        return await self._suspend(
            automation_id,
            AutomationSuspension(
                reason=reason, actor_id=actor_id, suspended_at=datetime.now(UTC)
            ),
        )

    async def _suspend(
        self, automation_id: str, suspension: AutomationSuspension
    ) -> Automation:
        """Close the runtime gate before awaiting persistence or unregistration."""
        existing = await self.get(automation_id)
        if existing.suspension is not None:
            return existing
        updated = existing.touch_updated_at(enabled=False, suspension=suspension)
        self._cache[automation_id] = updated
        await self._storage.update(updated)
        await self._stop_trigger(automation_id)
        return updated

    async def _trip(self, automation_id: str, reason: str) -> None:
        await self._suspend(
            automation_id,
            AutomationSuspension(
                reason=reason,
                actor_id=SYSTEM_ACTOR,
                suspended_at=datetime.now(UTC),
                source="circuit_breaker",
            ),
        )

    # Execution log

    async def _log_execution(self, execution: AutomationExecution) -> None:
        await self._storage.log_execution(execution)

    async def list_executions(
        self, automation_id: str
    ) -> Sequence[AutomationExecution]:
        return await self._storage.list_executions(automation_id)

    async def list_diagnostics(
        self, automation_id: str
    ) -> Sequence[AutomationDiagnostic]:
        automation = await self.get(automation_id)
        return await diagnose(
            automation, list(self._cache.values()), self._action_providers
        )

    def list_trigger_schemas(self) -> dict[str, dict]:
        return {
            p.id: p.params_model.model_json_schema() for p in self._providers.values()
        }

    def list_action_schemas(self) -> dict[str, dict]:
        return {
            p.id: p.params_model.model_json_schema()
            for p in self._action_providers.values()
        }

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
            provider.params_model(**params)
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

    async def _restore_trigger(
        self, automation_id: str, automation: Automation
    ) -> None:
        """Best-effort re-registration after a later step failed. Logs rather
        than raising, so the caller's original exception is what propagates."""
        try:
            await self._start_trigger(automation)
        except Exception:
            logger.exception(
                "Failed to restore trigger for automation %r after failed update",
                automation_id,
            )

    async def _execute_automation_actions(
        self, automation_id: str, context: TriggerContext
    ) -> None:
        automation = self._cache.get(automation_id)
        if automation is None:
            msg = f"Automation {automation_id!r} not found"
            raise NotFoundError(msg)
        if not automation.enabled or automation.suspension is not None:
            return
        execution = AutomationExecution(
            id=gen_id(),
            automation_id=automation_id,
            triggered_at=context.timestamp,
            context=context,
            status=ExecutionStatus.SUCCESS,
        )
        if context.is_initial:
            execution.status = ExecutionStatus.INITIALIZED
            execution.reason = "first_observation"
            await self._log_execution(execution)
            return
        reason = "overlapping_execution" if automation_id in self._running else None
        if reason:
            execution.status = ExecutionStatus.SUSPENDED
            execution.reason = reason
            await self._trip(automation_id, reason)
            await self._log_execution(execution)
            return
        self._running.add(automation_id)
        try:
            await self._run_branch(automation, context, execution)
            await self._log_execution(execution)
            failures = (
                self._failures.get(automation_id, 0) + 1
                if execution.status == ExecutionStatus.FAILED
                else 0
            )
            self._failures[automation_id] = failures
            if failures >= automation.guardrails.max_consecutive_failures:
                await self._trip(automation_id, "consecutive_failures")
        finally:
            self._running.discard(automation_id)

    def _guard_reason(self, automation: Automation) -> str | None:
        """Bound activity per automation using a monotonic rolling window."""
        now = monotonic()
        recent = self._recent.setdefault(automation.id, deque())
        while recent and now - recent[0] >= automation.guardrails.window_seconds:
            recent.popleft()
        if len(recent) >= automation.guardrails.max_executions:
            return "execution_rate_exceeded"
        recent.append(now)
        return None

    async def _run_branch(
        self,
        automation: Automation,
        context: TriggerContext,
        execution: AutomationExecution,
    ) -> None:
        """Select once and dispatch once; a failed action never falls through."""
        try:
            branch = select_branch(
                automation, context, self._resolve_attribute, execution.branches
            )
            if branch is None:
                unknown = any(item.result == "unknown" for item in execution.branches)
                execution.status = (
                    ExecutionStatus.FAILED if unknown else ExecutionStatus.NO_MATCH
                )
                execution.reason = (
                    "condition_unknown" if unknown else "no_matching_branch"
                )
                return
            execution.branch_id = branch.id
            if reason := self._guard_reason(automation):
                execution.status = ExecutionStatus.SUSPENDED
                execution.reason = reason
                await self._trip(automation.id, reason)
                return
            provider = self._action_providers[branch.action.provider_id]
            execution.executed_at = datetime.now(UTC)
            execution.output_id = await provider.execute(branch.action.params, context)
        except ActionExecutionError as exc:
            execution.status = ExecutionStatus.FAILED
            execution.error = "No commands sent to the target"
            execution.error_details = exc.details
        except AutomationLoopError:
            execution.status = ExecutionStatus.SUSPENDED
            execution.reason = "direct_feedback"
            await self._trip(automation.id, "direct_feedback")
        except WriteRejectedError:
            execution.status = ExecutionStatus.FAILED
            execution.error = "Write rejected by protection"
            execution.reason = "write_rejected"
        except EvaluationLimitError:
            execution.status = ExecutionStatus.FAILED
            execution.reason = "evaluation_limit"
        except Exception:
            logger.exception("Automation %r action failed", automation.id)
            execution.status = ExecutionStatus.FAILED
            execution.error = "Action execution failed"

    def _make_on_fire(self, automation_id: str) -> OnFireCallback:
        async def on_fire(context: TriggerContext) -> None:
            await self._execute_automation_actions(automation_id, context)

        return on_fire
