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


class FakeTime:
    def __init__(self) -> None:
        self._t = datetime.now(UTC)

    def __call__(self) -> datetime:
        return self._t

    def advance(self, seconds: float) -> None:
        self._t += timedelta(seconds=seconds)


def _make_watchdog(
    on_silence: Mock | None = None,
) -> tuple[SilenceWatchdog, FakeTime]:
    fake = FakeTime()
    return SilenceWatchdog(INTERVAL, on_silence or Mock(), now=fake), fake


# Lifecycle — observable through callback behavior


@pytest.mark.asyncio
class TestLifecycle:
    async def test_escalates_after_start(self) -> None:
        on_silence = Mock()
        w, ft = _make_watchdog(on_silence)
        w.record_data()
        ft.advance(INTERVAL * (SILENCE_DEGRADED_MULTIPLIER + 0.5))
        await w.start()
        await asyncio.sleep(TICK)
        on_silence.assert_called_with(ConnectionStatus.DEGRADED)
        await w.stop()

    async def test_no_escalation_after_stop(self) -> None:
        on_silence = Mock()
        w, ft = _make_watchdog(on_silence)
        w.record_data()
        ft.advance(INTERVAL * (SILENCE_DEGRADED_MULTIPLIER + 0.5))
        await w.start()
        await w.stop()
        on_silence.reset_mock()
        await asyncio.sleep(TICK)
        on_silence.assert_not_called()

    async def test_start_is_idempotent(self) -> None:
        on_silence = Mock()
        w, ft = _make_watchdog(on_silence)
        w.record_data()
        ft.advance(INTERVAL * (SILENCE_DEGRADED_MULTIPLIER + 0.5))
        await w.start()
        await w.start()
        await asyncio.sleep(TICK)
        on_silence.assert_called_once_with(ConnectionStatus.DEGRADED)
        await w.stop()

    async def test_stop_is_idempotent(self) -> None:
        w, _ = _make_watchdog()
        await w.start()
        await w.stop()
        await w.stop()


# Silence detection


@pytest.mark.asyncio
class TestSilenceDetection:
    async def test_degrades_after_silence(self) -> None:
        on_silence = Mock()
        w, ft = _make_watchdog(on_silence)
        w.record_data()
        ft.advance(INTERVAL * (SILENCE_DEGRADED_MULTIPLIER + 0.5))
        await w.start()
        await asyncio.sleep(TICK)
        on_silence.assert_called_with(ConnectionStatus.DEGRADED)
        await w.stop()

    async def test_errors_after_extended_silence(self) -> None:
        on_silence = Mock()
        w, ft = _make_watchdog(on_silence)
        w.record_data()
        ft.advance(INTERVAL * (SILENCE_ERROR_MULTIPLIER + 0.5))
        await w.start()
        await asyncio.sleep(TICK)
        on_silence.assert_called_with(ConnectionStatus.ERROR)
        await w.stop()

    async def test_no_escalation_when_fresh(self) -> None:
        on_silence = Mock()
        w, _ = _make_watchdog(on_silence)
        await w.start()
        await asyncio.sleep(TICK)
        on_silence.assert_not_called()
        await w.stop()

    async def test_record_data_resets_clock(self) -> None:
        on_silence = Mock()
        w, ft = _make_watchdog(on_silence)
        ft.advance(INTERVAL * (SILENCE_DEGRADED_MULTIPLIER + 0.5))
        w.record_data()
        await w.start()
        await asyncio.sleep(TICK)
        on_silence.assert_not_called()
        await w.stop()

    async def test_on_silence_failure_is_suppressed(self) -> None:
        on_silence = Mock(side_effect=RuntimeError("boom"))
        w, ft = _make_watchdog(on_silence)
        w.record_data()
        ft.advance(INTERVAL * (SILENCE_DEGRADED_MULTIPLIER + 0.5))
        await w.start()
        await asyncio.sleep(TICK)
        on_silence.assert_called()
        await w.stop()
