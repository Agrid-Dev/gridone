from __future__ import annotations

import asyncio
import contextlib
import logging
from datetime import UTC, datetime
from typing import TYPE_CHECKING, ClassVar
from uuid import uuid4

from croniter import croniter
from pydantic import BaseModel, Field, field_validator

from automations.models import TriggerContext

if TYPE_CHECKING:
    from collections.abc import Awaitable, Callable

logger = logging.getLogger(__name__)


class ScheduleTrigger(BaseModel):
    cron: str = Field(title="Cron expression")

    @field_validator("cron")
    @classmethod
    def validate_cron(cls, v: str) -> str:
        if not croniter.is_valid(v):
            msg = f"Invalid cron expression: {v!r}"
            raise ValueError(msg)
        return v


class ScheduleListener:
    def __init__(
        self,
        cron: str,
        on_fire: Callable[[TriggerContext], Awaitable[None]],
    ) -> None:
        self._cron = cron
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
        it = croniter(self._cron, datetime.now(UTC))
        while True:
            next_dt: datetime = it.get_next(datetime)
            delay = (next_dt - datetime.now(UTC)).total_seconds()
            if delay > 0:
                await asyncio.sleep(delay)
            await self._on_fire(TriggerContext(timestamp=datetime.now(UTC)))


class ScheduleTriggerProvider:
    id = "schedule"
    trigger_schema: ClassVar[dict] = ScheduleTrigger.model_json_schema()

    def __init__(self) -> None:
        self._listeners: dict[str, ScheduleListener] = {}

    async def register(
        self,
        trigger_params: dict,
        on_fire: Callable[[TriggerContext], Awaitable[None]],
    ) -> str:
        trigger = ScheduleTrigger(**trigger_params)
        handle_id = uuid4().hex[:16]
        listener = ScheduleListener(trigger.cron, on_fire)
        await listener.start()
        self._listeners[handle_id] = listener
        return handle_id

    async def unregister(self, trigger_id: str) -> None:
        listener = self._listeners.pop(trigger_id, None)
        if listener is not None:
            await listener.stop()
