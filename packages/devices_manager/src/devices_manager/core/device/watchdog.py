from __future__ import annotations

import asyncio
import contextlib
from datetime import UTC, datetime
from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from collections.abc import Callable

from typing import Final

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
    ) -> None:
        self._interval = interval
        self._on_silence = on_silence
        self._last_data_time: datetime | None = None
        self._task: asyncio.Task[None] | None = None

    def record_data(self) -> None:
        self._last_data_time = datetime.now(UTC)

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
            self._last_data_time = datetime.now(UTC)
        try:
            while True:
                now = datetime.now(UTC)
                elapsed = (now - self._last_data_time).total_seconds()
                status_to_set = None
                sleep_secs = self._interval

                for multiplier, status in _SILENCE_THRESHOLDS:
                    if elapsed < multiplier * self._interval:
                        sleep_secs = multiplier * self._interval - elapsed
                        break
                    status_to_set = status

                if status_to_set is not None:
                    with contextlib.suppress(Exception):
                        self._on_silence(status_to_set)
                await asyncio.sleep(sleep_secs)
        except asyncio.CancelledError:
            return
