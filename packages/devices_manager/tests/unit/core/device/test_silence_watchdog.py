from __future__ import annotations

import asyncio
from datetime import UTC, datetime, timedelta
from unittest.mock import Mock

import pytest

from devices_manager.core.device.connection_status import (
    SILENCE_DEGRADED_MULTIPLIER,
    SILENCE_ERROR_MULTIPLIER,
)
from devices_manager.core.device.watchdog import SilenceWatchdog
from devices_manager.types import ConnectionStatus

INTERVAL = 1
TICK = 0.05


def _make_watchdog(on_silence: Mock | None = None) -> SilenceWatchdog:
    return SilenceWatchdog(INTERVAL, on_silence or Mock())


def _silence(watchdog: SilenceWatchdog, multiplier: float) -> None:
    watchdog._last_data_time = datetime.now(UTC) - timedelta(  # noqa: SLF001
        seconds=multiplier * INTERVAL
    )


# Lifecycle


@pytest.mark.asyncio
class TestLifecycle:
    async def test_start_creates_running_task(self) -> None:
        w = _make_watchdog()
        await w.start()
        assert w._task is not None  # noqa: SLF001
        assert not w._task.done()  # noqa: SLF001
        await w.stop()

    async def test_stop_cancels_task(self) -> None:
        w = _make_watchdog()
        await w.start()
        task = w._task  # noqa: SLF001
        await w.stop()
        assert task is not None
        assert task.done()
        assert w._task is None  # noqa: SLF001

    async def test_start_is_idempotent(self) -> None:
        w = _make_watchdog()
        await w.start()
        task = w._task  # noqa: SLF001
        await w.start()
        assert w._task is task  # noqa: SLF001
        await w.stop()

    async def test_stop_is_idempotent(self) -> None:
        w = _make_watchdog()
        await w.start()
        await w.stop()
        await w.stop()


# Silence detection


@pytest.mark.asyncio
class TestSilenceDetection:
    async def test_degrades_after_silence(self) -> None:
        on_silence = Mock()
        w = SilenceWatchdog(INTERVAL, on_silence)
        _silence(w, SILENCE_DEGRADED_MULTIPLIER + 0.5)
        await w.start()
        await asyncio.sleep(TICK)
        on_silence.assert_called_with(ConnectionStatus.DEGRADED)
        await w.stop()

    async def test_errors_after_extended_silence(self) -> None:
        on_silence = Mock()
        w = SilenceWatchdog(INTERVAL, on_silence)
        _silence(w, SILENCE_ERROR_MULTIPLIER + 0.5)
        await w.start()
        await asyncio.sleep(TICK)
        on_silence.assert_called_with(ConnectionStatus.ERROR)
        await w.stop()

    async def test_no_escalation_when_fresh(self) -> None:
        on_silence = Mock()
        w = SilenceWatchdog(INTERVAL, on_silence)
        await w.start()
        await asyncio.sleep(TICK)
        on_silence.assert_not_called()
        await w.stop()

    async def test_record_data_resets_clock(self) -> None:
        on_silence = Mock()
        w = SilenceWatchdog(INTERVAL, on_silence)
        _silence(w, SILENCE_DEGRADED_MULTIPLIER + 0.5)
        w.record_data()
        await w.start()
        await asyncio.sleep(TICK)
        on_silence.assert_not_called()
        await w.stop()

    async def test_on_silence_failure_does_not_crash_loop(self) -> None:
        on_silence = Mock(side_effect=RuntimeError("boom"))
        w = SilenceWatchdog(INTERVAL, on_silence)
        _silence(w, SILENCE_DEGRADED_MULTIPLIER + 0.5)
        await w.start()
        await asyncio.sleep(TICK)
        assert w._task is not None  # noqa: SLF001
        assert not w._task.done()  # noqa: SLF001
        await w.stop()
