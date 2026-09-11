"""Tests for polling-group sweep scheduling."""

from __future__ import annotations

import asyncio
from collections import Counter

import pytest

from devices_manager.core.device.sweep_schedule import SweepSchedule, run_on_schedule

from ..fixtures.fake_time import fake_time

INTERVAL = 60.0
PHASE = 15.0


class TestNextAfter:
    @pytest.mark.parametrize(
        ("now", "expected"),
        [
            (0.0, 15.0),
            (14.9, 15.0),
            (15.0, 75.0),  # strictly after: a slot that just ran is not reused
            (15.1, 75.0),
            (200.0, 255.0),  # several intervals late: next slot, no catch-up
        ],
    )
    def test_returns_the_first_slot_strictly_after_now(
        self, now: float, expected: float
    ):
        schedule = SweepSchedule(interval=INTERVAL, phase=PHASE)

        assert schedule.next_after(now) == expected

    def test_is_strictly_after_now_when_float_rounding_lands_on_the_slot(self):
        # (now - phase) / interval rounds just below 273, so the naive formula
        # would return `now` itself and trigger a second sweep on the same slot.
        schedule = SweepSchedule(interval=60, phase=39.969529495739955)
        now = 16419.96952949574

        assert schedule.next_after(now) > now


class TestForGroup:
    def test_phase_is_within_the_interval(self):
        phases = [
            SweepSchedule.for_group(f"device-{i}", "realtime", INTERVAL).phase
            for i in range(1000)
        ]

        assert all(0 <= phase < INTERVAL for phase in phases)

    def test_phase_is_stable_across_processes(self):
        # Pinned: a change of hash would silently reshuffle every deployed fleet.
        schedule = SweepSchedule.for_group("7f91da0d38c64aa2", "realtime", 3600)

        assert schedule.phase == pytest.approx(1281.6131617459068)

    def test_groups_of_one_device_get_distinct_phases(self):
        realtime = SweepSchedule.for_group("device-1", "realtime", 3600)
        conf = SweepSchedule.for_group("device-1", "conf", 3600)
        default = SweepSchedule.for_group("device-1", None, 3600)

        assert len({realtime.phase, conf.phase, default.phase}) == 3

    def test_phase_scales_with_the_interval(self):
        hourly = SweepSchedule.for_group("device-1", "realtime", 3600)
        daily = SweepSchedule.for_group("device-1", "realtime", 86400)

        assert daily.phase == pytest.approx(hourly.phase * 24)

    def test_devices_spread_evenly_over_the_interval(self):
        buckets = Counter(
            int(SweepSchedule.for_group(f"device-{i}", None, 10).phase)
            for i in range(1000)
        )

        assert set(buckets) == set(range(10))
        assert all(70 <= count <= 130 for count in buckets.values())


class SweepRecorder:
    """A sweep that records its start times and how many run at once."""

    # A loop re-sweeping one slot never lets time advance; fail instead of hanging.
    MAX_SWEEPS = 100

    def __init__(self, duration: float = 0.0, failures: int = 0) -> None:
        self.duration = duration
        self.failures = failures
        self.starts: list[float] = []
        self.running = 0
        self.max_running = 0

    async def __call__(self) -> None:
        self.starts.append(asyncio.get_running_loop().time())
        if len(self.starts) > self.MAX_SWEEPS:
            msg = "runaway sweeps"
            raise RuntimeError(msg)
        self.running += 1
        self.max_running = max(self.max_running, self.running)
        try:
            await asyncio.sleep(self.duration)
            if len(self.starts) <= self.failures:
                msg = "sweep failed"
                raise RuntimeError(msg)
        finally:
            self.running -= 1


async def run_for(seconds: float, schedule: SweepSchedule, sweep, *, sweep_now):
    task = asyncio.create_task(run_on_schedule(schedule, sweep, sweep_now=sweep_now))
    await asyncio.sleep(seconds)
    task.cancel()
    await asyncio.gather(task, return_exceptions=True)


@pytest.mark.asyncio
@fake_time
class TestRunOnSchedule:
    async def test_sweeps_on_the_slots(self):
        sweep = SweepRecorder()

        await run_for(200, SweepSchedule(INTERVAL, PHASE), sweep, sweep_now=False)

        assert sweep.starts == [15, 75, 135, 195]

    async def test_sweeps_each_slot_once_when_the_loop_wakes_early(self):
        # The loop may fire a timer a hair before its deadline (clock
        # resolution); a phase that is not a round number exposes it.
        schedule = SweepSchedule(interval=5, phase=2.5412419730664086)
        sweep = SweepRecorder()

        await run_for(20, schedule, sweep, sweep_now=False)

        assert sweep.starts == pytest.approx(
            [2.5412, 7.5412, 12.5412, 17.5412], abs=1e-3
        )

    async def test_sweep_now_adds_one_sweep_before_the_first_slot(self):
        sweep = SweepRecorder()

        await run_for(100, SweepSchedule(INTERVAL, PHASE), sweep, sweep_now=True)

        assert sweep.starts == [0, 15, 75]

    async def test_an_overrunning_sweep_skips_missed_slots_without_overlap(self):
        sweep = SweepRecorder(duration=150)

        await run_for(400, SweepSchedule(INTERVAL, PHASE), sweep, sweep_now=False)

        # 15 → 165 misses 75 and 135; the next sweep waits for 195.
        assert sweep.starts == [15, 195, 375]
        assert sweep.max_running == 1

    async def test_a_failing_sweep_ends_the_loop(self):
        sweep = SweepRecorder(failures=1)
        task = asyncio.create_task(
            run_on_schedule(SweepSchedule(INTERVAL, PHASE), sweep, sweep_now=False)
        )

        with pytest.raises(RuntimeError, match="sweep failed"):
            await task
        assert sweep.starts == [15]
