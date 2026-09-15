from __future__ import annotations

import asyncio
from time import monotonic
from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from collections.abc import Callable


class CommandExpiry:
    """Expire observed command context independently of communication health."""

    def __init__(
        self,
        interval: float,
        on_expired: Callable[[], None],
        *,
        now: Callable[[], float] = monotonic,
    ) -> None:
        self._interval = interval
        self._on_expired = on_expired
        self._now = now
        self._deadline: float | None = None
        self._loop: asyncio.AbstractEventLoop | None = None
        self._timer: asyncio.TimerHandle | None = None

    def expire_if_due(self) -> None:
        """Enforce the deadline synchronously even when the event loop runs late."""
        if self._deadline is not None and self._now() >= self._deadline:
            self._cancel_timer()
            self._deadline = None
            self._on_expired()

    def record_observation(self) -> None:
        """Renew command knowledge from acquisition without changing push health."""
        self._deadline = self._now() + self._interval
        self._cancel_timer()
        if self._loop is not None:
            self._timer = self._loop.call_later(self._interval, self._on_timer)

    def _on_timer(self) -> None:
        """Rearm if the event loop dispatched the timer before the deadline."""
        self._timer = None
        self.expire_if_due()
        if self._deadline is not None and self._loop is not None:
            self._timer = self._loop.call_later(
                self._deadline - self._now(), self._on_timer
            )

    def watch(self) -> None:
        """Start a fresh expiry window; repeated calls leave the deadline intact."""
        if self._loop is None:
            self._loop = asyncio.get_running_loop()
            self.record_observation()

    def close(self) -> None:
        """Cancel expiry without publishing a command-state change."""
        self._cancel_timer()
        self._loop = None
        self._deadline = None

    def _cancel_timer(self) -> None:
        if self._timer is not None:
            self._timer.cancel()
            self._timer = None
