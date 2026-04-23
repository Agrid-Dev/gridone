from __future__ import annotations

import asyncio
import contextlib
import logging
from datetime import UTC, datetime
from typing import TYPE_CHECKING, ClassVar
from uuid import uuid4

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
    id = "schedule"
    trigger_schema: ClassVar[dict] = {
        "type": "object",
        "properties": {
            "cron": {"type": "string", "title": "Cron expression"},
        },
        "required": ["cron"],
    }

    def __init__(self) -> None:
        self._listeners: dict[str, ScheduleListener] = {}

    async def register(
        self,
        trigger_params: dict,
        on_fire: Callable[[TriggerContext], Awaitable[None]],
    ) -> str:
        handle_id = uuid4().hex[:16]
        trigger = ScheduleTrigger(**trigger_params)
        listener = ScheduleListener(trigger, on_fire)
        await listener.start()
        self._listeners[handle_id] = listener
        return handle_id

    async def unregister(self, trigger_id: str) -> None:
        listener = self._listeners.pop(trigger_id, None)
        if listener is not None:
            await listener.stop()
