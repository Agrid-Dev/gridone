"""Run a device's background dependency acquisitions one pass at a time."""

from __future__ import annotations

import asyncio
from contextlib import suppress
from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from collections.abc import Awaitable, Callable


class DependencyRefresh:
    """One acquisition worker per device.

    Each pass decides what to read when it starts. A request made while a pass
    runs buys exactly one more pass, whatever the number of requests: that
    pass reads what is still missing then, including what the running pass
    could not read because the connection dropped under it.
    """

    def __init__(self, acquire: Callable[[], Awaitable[None]]) -> None:
        self._acquire = acquire
        self._again = False
        self._task: asyncio.Task[None] | None = None

    def request(self) -> asyncio.Task[None]:
        self._again = True
        if self._task is None or self._task.done():
            self._task = asyncio.create_task(self._run())
        return self._task

    async def _run(self) -> None:
        while self._again:
            self._again = False
            await self._acquire()

    async def close(self) -> None:
        self._again = False
        if self._task is not None:
            self._task.cancel()
            with suppress(asyncio.CancelledError):
                await self._task
        self._task = None
