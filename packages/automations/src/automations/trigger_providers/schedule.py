from __future__ import annotations

import asyncio
import contextlib
import logging
from datetime import UTC, datetime
from typing import TYPE_CHECKING

from croniter import croniter

from automations.models import ScheduleTrigger, TriggerContext

if TYPE_CHECKING:
    from collections.abc import Awaitable, Callable

logger = logging.getLogger(__name__)


class ScheduleListener:
    def __init__(
        self,
        trigger: ScheduleTrigger,
        on_fire: Callable[[TriggerContext], Awaitable[None]],
    ) -> None:
        self._trigger = trigger
        self._on_fire = on_fire
        self._task: asyncio.Task[None] | None = None

    async def start(self) -> None:
        self._task = asyncio.create_task(self._run())

    async def stop(self) -> None:
        if self._task is not None:
            self._task.cancel()
            with contextlib.suppress(asyncio.CancelledError):
                await self._task
            self._task = None

    async def _run(self) -> None:
        it = croniter(self._trigger.cron, datetime.now(UTC))
        while True:
            next_dt: datetime = it.get_next(datetime)
            delay = (next_dt - datetime.now(UTC)).total_seconds()
            if delay > 0:
                await asyncio.sleep(delay)
            try:
                await self._on_fire(TriggerContext(timestamp=datetime.now(UTC)))
            except Exception:
                logger.exception(
                    "Schedule trigger on_fire failed for cron %r", self._trigger.cron
                )


class ScheduleTriggerProvider:
    def build(
        self,
        trigger: ScheduleTrigger,
        on_fire: Callable[[TriggerContext], Awaitable[None]],
    ) -> ScheduleListener:
        return ScheduleListener(trigger, on_fire)
