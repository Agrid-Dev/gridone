import asyncio
import contextlib
import logging
from collections.abc import Awaitable, Callable
from datetime import UTC, datetime, tzinfo
from typing import ClassVar
from uuid import uuid4
from zoneinfo import ZoneInfo

from croniter import croniter
from pydantic import BaseModel, Field, field_validator

from automations.models import TriggerContext

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
    """Fires ``on_fire`` on every occurrence of a cron expression.

    The expression is read in ``tz`` — the building's timezone, not the
    server's — so "at 09:00" means 09:00 where the equipment is. croniter
    walks aware datetimes, so an occurrence keeps its wall-clock time across
    DST changes (09:00 local is 07:00Z in summer, 08:00Z in winter).
    """

    def __init__(
        self,
        cron: str,
        on_fire: Callable[[TriggerContext], Awaitable[None]],
        tz: tzinfo = UTC,
    ) -> None:
        self._cron = cron
        self._on_fire = on_fire
        self._tz = tz
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
        it = croniter(self._cron, datetime.now(self._tz))
        while True:
            next_dt: datetime = it.get_next(datetime)
            # Both operands are aware, so the subtraction is exact whatever
            # zone each one carries.
            delay = (next_dt - datetime.now(UTC)).total_seconds()
            if delay > 0:
                await asyncio.sleep(delay)
            # Executions are recorded in UTC, as everywhere else in storage.
            await self._on_fire(TriggerContext(timestamp=datetime.now(UTC)))


class ScheduleTriggerProvider:
    id = "schedule"
    params_model: ClassVar[type[BaseModel]] = ScheduleTrigger

    def __init__(self, timezone: str = "UTC") -> None:
        """Schedules are read in ``timezone`` (an IANA name), the deployment's
        building timezone. Defaults to UTC so an unconfigured deployment keeps
        the previous behaviour."""
        self._tz = ZoneInfo(timezone)
        self._listeners: dict[str, ScheduleListener] = {}

    async def register(
        self,
        params: dict,
        on_fire: Callable[[TriggerContext], Awaitable[None]],
    ) -> str:
        trigger = ScheduleTrigger(**params)
        handle_id = uuid4().hex[:16]
        listener = ScheduleListener(trigger.cron, on_fire, self._tz)
        await listener.start()
        self._listeners[handle_id] = listener
        return handle_id

    async def unregister(self, trigger_id: str) -> None:
        listener = self._listeners.pop(trigger_id, None)
        if listener is not None:
            await listener.stop()
