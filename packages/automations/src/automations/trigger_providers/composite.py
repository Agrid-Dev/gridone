from __future__ import annotations

from typing import TYPE_CHECKING

from automations.models import ChangeEventTrigger, ScheduleTrigger

if TYPE_CHECKING:
    from collections.abc import Awaitable, Callable

    from automations.models import Trigger, TriggerContext
    from automations.protocols import TriggerListener
    from automations.trigger_providers.change_event import ChangeEventTriggerProvider
    from automations.trigger_providers.schedule import ScheduleTriggerProvider


class CompositeTriggerListenerFactory:
    """Implements TriggerListenerFactory — dispatches to the right provider."""

    def __init__(
        self,
        change_event: ChangeEventTriggerProvider,
        schedule: ScheduleTriggerProvider,
    ) -> None:
        self._change_event = change_event
        self._schedule = schedule

    def build(
        self,
        trigger: Trigger,
        on_fire: Callable[[TriggerContext], Awaitable[None]],
    ) -> TriggerListener:
        if isinstance(trigger, ChangeEventTrigger):
            return self._change_event.build(trigger, on_fire)
        if isinstance(trigger, ScheduleTrigger):
            return self._schedule.build(trigger, on_fire)
        msg = f"Unsupported trigger type: {trigger!r}"
        raise ValueError(msg)
