"""When polling-group sweeps run.

Each (device, group) sweeps on fixed slots ``phase + k * interval`` of the
event-loop clock. The phase comes from a hash of the device id and the group
name, so devices started together (at boot, after a package install, after a
driver patch) spread over the interval instead of sweeping in lockstep, and a
restart does not move a device's slots.
"""

from __future__ import annotations

import asyncio
import hashlib
import math
from dataclasses import dataclass
from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from collections.abc import Awaitable, Callable

_HASH_BYTES = 8


@dataclass(frozen=True)
class SweepSchedule:
    interval: float
    phase: float

    @classmethod
    def for_group(
        cls, device_id: str, group: str | None, interval: float
    ) -> SweepSchedule:
        """Derive a stable phase in ``[0, interval)`` for one polling group.

        blake2b rather than ``hash()``: string hashing is salted per process,
        which would reshuffle every phase on each restart. The digest maps to
        a fraction of the interval, so changing the interval scales the phase
        rather than moving the group to an unrelated slot.
        """
        key = f"{device_id}\x00{group or ''}".encode()
        digest = hashlib.blake2b(key, digest_size=_HASH_BYTES).digest()
        fraction = int.from_bytes(digest) / 2 ** (8 * _HASH_BYTES)
        return cls(interval=interval, phase=fraction * interval)

    def next_after(self, now: float) -> float:
        """First slot strictly after ``now``: ``t > now``, ``t ≡ phase (mod interval)``.

        Missed slots are skipped, never caught up.
        """
        slots_elapsed = math.floor((now - self.phase) / self.interval)
        slot = self.phase + (slots_elapsed + 1) * self.interval
        # Float rounding can land exactly on `now` when `now` is itself a slot.
        return slot if slot > now else slot + self.interval


async def run_on_schedule(
    schedule: SweepSchedule,
    sweep: Callable[[], Awaitable[None]],
    *,
    sweep_now: bool,
) -> None:
    """Run ``sweep`` on the schedule's slots until cancelled.

    Sweeps never overlap: the next slot is computed once the previous sweep
    has returned, so a sweep overrunning its interval skips the slots it
    missed. ``sweep_now`` adds one sweep before the first slot. An exception
    from ``sweep`` ends the loop; callers that must keep polling isolate
    their own failures.
    """
    loop = asyncio.get_running_loop()
    if sweep_now:
        await sweep()
    slot = schedule.next_after(loop.time())
    while True:
        await asyncio.sleep(slot - loop.time())
        await sweep()
        # asyncio may fire a timer up to its clock resolution early, so `now`
        # can still be before `slot`: never sweep the same slot twice.
        slot = schedule.next_after(max(loop.time(), slot))
