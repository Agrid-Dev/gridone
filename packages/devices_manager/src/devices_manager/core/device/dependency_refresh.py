"""Coalesce bounded dependency acquisitions without changing periodic polling."""

from __future__ import annotations

import asyncio
from contextlib import suppress
from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from collections.abc import Awaitable, Callable


class DependencyRefresh:
    """One acquisition worker per device; concurrent requests share its work."""

    def __init__(self, read: Callable[[set[str]], Awaitable[None]]) -> None:
        self._read = read
        self._pending: set[str] = set()
        self._active: set[str] = set()
        self._task: asyncio.Task[None] | None = None

    def request(
        self, names: set[str], *, delay: float = 0, repeat_active: bool = False
    ) -> asyncio.Task[None]:
        self._pending.update(names if repeat_active else names - self._active)
        if self._task is None or self._task.done():
            self._task = asyncio.create_task(self._run(delay))
        return self._task

    async def _run(self, delay: float) -> None:
        try:
            if delay:
                await asyncio.sleep(delay)
            while self._pending:
                names, self._pending = self._pending, set()
                self._active = set(names)
                await self._read(names)
                self._active.clear()
        finally:
            self._active.clear()

    async def close(self) -> None:
        if self._task is not None:
            self._task.cancel()
            with suppress(asyncio.CancelledError):
                await self._task
        self._task = None
        self._pending.clear()
