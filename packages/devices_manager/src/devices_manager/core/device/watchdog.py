from __future__ import annotations

import asyncio
import contextlib
from datetime import UTC, datetime
from typing import TYPE_CHECKING, Final

if TYPE_CHECKING:
    from collections.abc import Callable

from devices_manager.types import ConnectionStatus

from .connection_status import SILENCE_DEGRADED_MULTIPLIER, SILENCE_ERROR_MULTIPLIER

_SILENCE_THRESHOLDS: Final = [
    (SILENCE_DEGRADED_MULTIPLIER, ConnectionStatus.DEGRADED),
    (SILENCE_ERROR_MULTIPLIER, ConnectionStatus.ERROR),
]


class SilenceWatchdog:
    def __init__(
        self,
        interval: float,
        on_silence: Callable[[ConnectionStatus], None],
        *,
        now: Callable[[], datetime] | None = None,
        on_expired: Callable[[], None] | None = None,
    ) -> None:
        self._interval = interval
        self._on_silence = on_silence
        self._now = now if now is not None else lambda: datetime.now(UTC)
        self._last_data_time: datetime | None = None
        self._last_observation_time: datetime | None = None
        self._on_expired = on_expired
        self._expired = False
        self._task: asyncio.Task[None] | None = None

    def expire_if_due(self) -> None:
        """Enforce the deadline synchronously even when the event loop runs late."""
        if (
            not self._expired
            and self._last_observation_time is not None
            and (self._now() - self._last_observation_time).total_seconds()
            >= self._interval
        ):
            self._expired = True
            if self._on_expired:
                self._on_expired()

    def record_data(self) -> None:
        self._last_data_time = self._now()

    def record_observation(self) -> None:
        """Renew command knowledge from acquisition without changing push health."""
        self._last_observation_time = self._now()
        self._expired = False

    async def start(self) -> None:
        if self._task is None or self._task.done():
            self._task = asyncio.create_task(self._loop())

    async def stop(self) -> None:
        if self._task is not None and not self._task.done():
            self._task.cancel()
            with contextlib.suppress(asyncio.CancelledError):
                await self._task
        self._task = None

    async def _loop(self) -> None:
        if self._last_data_time is None:
            self._last_data_time = self._now()
        if self._last_observation_time is None:
            self._last_observation_time = self._now()
        try:
            while True:
                now = self._now()
                elapsed = (now - self._last_data_time).total_seconds()
                self.expire_if_due()
                status_to_set = None
                sleep_secs = self._interval

                for multiplier, status in _SILENCE_THRESHOLDS:
                    if elapsed < multiplier * self._interval:
                        sleep_secs = multiplier * self._interval - elapsed
                        break
                    status_to_set = status

                if not self._expired:
                    observed_elapsed = (
                        now - self._last_observation_time
                    ).total_seconds()
                    sleep_secs = min(sleep_secs, self._interval - observed_elapsed)

                if status_to_set is not None:
                    with contextlib.suppress(Exception):
                        self._on_silence(status_to_set)
                await asyncio.sleep(sleep_secs)
        except asyncio.CancelledError:
            return
