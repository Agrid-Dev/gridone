from __future__ import annotations

import asyncio
from unittest.mock import Mock

import pytest

from devices_manager.core.device.connection_status import (
    SILENCE_DEGRADED_MULTIPLIER,
    SILENCE_ERROR_MULTIPLIER,
    ConnectionMonitor,
    EventType,
)
from devices_manager.types import ConnectionStatus

from ...fixtures.fake_time import fake_time

INTERVAL = 60
READ = EventType.READ
WRITE = EventType.WRITE
LISTEN = EventType.LISTEN


def _monitor(silence_interval: float | None = None) -> tuple[ConnectionMonitor, Mock]:
    publish = Mock()
    return ConnectionMonitor(publish, silence_interval=silence_interval), publish


def _published(publish: Mock) -> list[ConnectionStatus]:
    return [c.args[0] for c in publish.call_args_list]


class TestLogs:
    def test_unknown_attribute_has_empty_logs(self) -> None:
        logs = _monitor()[0].logs("temperature")
        assert (logs.read, logs.write, logs.listen) == ([], [], [])

    def test_outcomes_are_kept_per_event_type_newest_first(self) -> None:
        monitor, _ = _monitor()
        monitor.record(READ, "temperature")
        monitor.record(READ, "temperature", OSError("Connection refused"))
        monitor.record(WRITE, "temperature")
        logs = monitor.logs("temperature")
        assert [(e.status, e.message) for e in logs.read] == [
            ("error", "Connection refused"),
            ("ok", None),
        ]
        assert [e.event_type for e in logs.write] == [WRITE]
        assert logs.listen == []

    def test_outcomes_are_kept_per_attribute(self) -> None:
        monitor, _ = _monitor()
        monitor.record(READ, "temperature")
        assert monitor.logs("humidity").read == []

    def test_each_log_keeps_the_last_ten_outcomes(self) -> None:
        monitor, _ = _monitor()
        for _ in range(15):
            monitor.record(READ, "temperature")
        assert len(monitor.logs("temperature").read) == 10

    def test_logs_are_a_copy(self) -> None:
        monitor, _ = _monitor()
        monitor.record(READ, "temperature")
        monitor.logs("temperature").read.clear()
        assert len(monitor.logs("temperature").read) == 1


class TestObserve:
    def test_records_ok_when_the_block_succeeds(self) -> None:
        monitor, _ = _monitor()
        with monitor.observe(READ, "temperature"):
            pass
        assert [e.status for e in monitor.logs("temperature").read] == ["ok"]

    def test_records_the_error_and_reraises(self) -> None:
        monitor, _ = _monitor()
        with (
            pytest.raises(OSError, match="timeout"),
            monitor.observe(READ, "temperature"),
        ):
            raise OSError("timeout")
        [entry] = monitor.logs("temperature").read
        assert (entry.status, entry.message) == ("error", "timeout")


class TestStatusFromOutcomes:
    @pytest.mark.parametrize(
        ("outcomes", "expected"),
        [
            ([], ConnectionStatus.IDLE),
            ([(READ, "a", None)], ConnectionStatus.OK),
            ([(LISTEN, "a", None)], ConnectionStatus.OK),
            ([(READ, "a", OSError())], ConnectionStatus.ERROR),
            ([(READ, "a", None), (READ, "a", OSError())], ConnectionStatus.DEGRADED),
            # logs are not pooled: a fully failing read log is total loss even
            # when the attribute's listens succeed
            ([(LISTEN, "a", None), (READ, "a", OSError())], ConnectionStatus.ERROR),
            (
                [(LISTEN, "a", None), (READ, "a", None), (READ, "a", OSError())],
                ConnectionStatus.DEGRADED,
            ),
            # and across attributes
            ([(READ, "a", None), (READ, "b", OSError())], ConnectionStatus.DEGRADED),
            ([(READ, "a", OSError()), (READ, "b", OSError())], ConnectionStatus.ERROR),
            # writes say nothing about reachability
            ([(WRITE, "a", OSError())], ConnectionStatus.IDLE),
            ([(READ, "a", None), (WRITE, "a", OSError())], ConnectionStatus.OK),
        ],
    )
    def test_status(
        self,
        outcomes: list[tuple[EventType, str, Exception | None]],
        expected: ConnectionStatus,
    ) -> None:
        monitor, _ = _monitor()
        for event_type, attribute, error in outcomes:
            monitor.record(event_type, attribute, error)
        assert monitor.status == expected

    @pytest.mark.parametrize(
        ("failures", "expected"),
        [
            (0, ConnectionStatus.OK),
            (1, ConnectionStatus.OK),
            # the tolerated loss itself is still acceptable
            (2, ConnectionStatus.OK),
            (3, ConnectionStatus.DEGRADED),
            (9, ConnectionStatus.DEGRADED),
            (10, ConnectionStatus.ERROR),
        ],
    )
    def test_tolerated_attribute_loss(
        self, failures: int, expected: ConnectionStatus
    ) -> None:
        monitor = ConnectionMonitor(Mock(), max_attribute_loss=0.2)
        for i in range(10):
            monitor.record(READ, "a", OSError() if i < failures else None)
        assert monitor.status == expected

    def test_the_worse_log_decides(self) -> None:
        monitor = ConnectionMonitor(Mock(), max_attribute_loss=0.2)
        for i in range(10):
            monitor.record(LISTEN, "a", ValueError() if i < 1 else None)
            monitor.record(READ, "a", OSError() if i < 3 else None)
        assert monitor.status == ConnectionStatus.DEGRADED

    def test_total_loss_on_one_attribute_is_never_tolerated(self) -> None:
        monitor = ConnectionMonitor(Mock(), max_attribute_loss=0.2)
        for name in ("a", "b", "c"):
            monitor.record(READ, name)
        monitor.record(READ, "broken", OSError())
        assert monitor.status == ConnectionStatus.DEGRADED

    def test_only_retained_outcomes_count(self) -> None:
        monitor, _ = _monitor()
        monitor.record(READ, "a", OSError())
        for _ in range(10):
            monitor.record(READ, "a")
        assert monitor.status == ConnectionStatus.OK

    def test_publishes_each_change_once(self) -> None:
        monitor, publish = _monitor()
        monitor.record(READ, "a")
        monitor.record(READ, "a")
        monitor.record(READ, "a", OSError())
        for _ in range(10):
            monitor.record(READ, "a", OSError())
        assert _published(publish) == [
            ConnectionStatus.OK,
            ConnectionStatus.DEGRADED,
            ConnectionStatus.ERROR,
        ]

    def test_publishes_nothing_before_any_outcome(self) -> None:
        monitor, publish = _monitor()
        monitor.record(WRITE, "a")
        publish.assert_not_called()

    def test_a_failing_publish_does_not_break_recording(self) -> None:
        monitor = ConnectionMonitor(Mock(side_effect=RuntimeError("boom")))
        monitor.record(READ, "a")
        assert monitor.status == ConnectionStatus.OK


class TestForgetAndRename:
    def test_forget_drops_logs_and_health(self) -> None:
        monitor, publish = _monitor()
        monitor.record(READ, "a")
        monitor.record(READ, "b", OSError())
        monitor.forget("b")
        assert monitor.logs("b").read == []
        assert monitor.status == ConnectionStatus.OK
        assert _published(publish)[-1] == ConnectionStatus.OK

    def test_forget_unknown_attribute_is_a_no_op(self) -> None:
        monitor, _ = _monitor()
        monitor.record(READ, "a")
        monitor.forget("b")
        assert monitor.status == ConnectionStatus.OK

    def test_rename_moves_logs_and_health(self) -> None:
        monitor, _ = _monitor()
        monitor.record(READ, "a")
        monitor.record(READ, "b", OSError())
        original = monitor.logs("b")
        monitor.rename("b", "c")
        assert monitor.logs("c") == original
        assert monitor.logs("b").read == []
        monitor.forget("c")
        assert monitor.status == ConnectionStatus.OK

    def test_rename_onto_a_tracked_attribute_replaces_it(self) -> None:
        monitor, publish = _monitor()
        monitor.record(READ, "a")
        monitor.record(READ, "b", OSError())
        assert monitor.status == ConnectionStatus.DEGRADED
        monitor.rename("a", "b")
        assert monitor.status == ConnectionStatus.OK
        assert _published(publish)[-1] == ConnectionStatus.OK
        assert [e.status for e in monitor.logs("b").read] == ["ok"]
        assert monitor.logs("a").read == []

    def test_rename_unknown_attribute_is_a_no_op(self) -> None:
        monitor, _ = _monitor()
        monitor.rename("a", "b")
        assert monitor.logs("b").read == []


@fake_time
@pytest.mark.asyncio
class TestSilence:
    async def test_no_detection_without_a_silence_interval(self) -> None:
        monitor, publish = _monitor()
        monitor.watch()
        await asyncio.sleep(10 * INTERVAL)
        publish.assert_not_called()
        monitor.close()

    async def test_no_detection_until_watched(self) -> None:
        _, publish = _monitor(INTERVAL)
        await asyncio.sleep(10 * INTERVAL)
        publish.assert_not_called()

    async def test_escalates_with_the_silence(self) -> None:
        monitor, publish = _monitor(INTERVAL)
        monitor.watch()
        await asyncio.sleep((SILENCE_DEGRADED_MULTIPLIER + 0.5) * INTERVAL)
        assert monitor.status == ConnectionStatus.DEGRADED
        await asyncio.sleep(INTERVAL)
        assert _published(publish) == [
            ConnectionStatus.DEGRADED,
            ConnectionStatus.ERROR,
        ]
        monitor.close()

    async def test_watch_is_idempotent(self) -> None:
        monitor, _ = _monitor(INTERVAL)
        monitor.watch()
        await asyncio.sleep(1.5 * INTERVAL)
        monitor.watch()
        await asyncio.sleep(INTERVAL)
        assert monitor.status == ConnectionStatus.DEGRADED
        monitor.close()

    async def test_outcomes_do_not_override_a_worse_silence(self) -> None:
        monitor, _ = _monitor(INTERVAL)
        monitor.watch()
        monitor.record(LISTEN, "a")
        await asyncio.sleep((SILENCE_ERROR_MULTIPLIER + 0.5) * INTERVAL)
        monitor.record(READ, "a", OSError("timeout"))
        assert monitor.status == ConnectionStatus.ERROR
        monitor.close()

    async def test_outcomes_win_over_a_milder_silence(self) -> None:
        monitor, _ = _monitor(INTERVAL)
        monitor.watch()
        monitor.record(READ, "a", OSError("timeout"))
        await asyncio.sleep((SILENCE_DEGRADED_MULTIPLIER + 0.5) * INTERVAL)
        assert monitor.status == ConnectionStatus.ERROR
        monitor.close()

    async def test_data_received_ends_the_silence_and_restarts_the_clock(
        self,
    ) -> None:
        monitor, publish = _monitor(INTERVAL)
        monitor.watch()
        await asyncio.sleep((SILENCE_ERROR_MULTIPLIER + 0.5) * INTERVAL)
        monitor.record(LISTEN, "a")
        assert monitor.status == ConnectionStatus.OK
        assert _published(publish)[-1] == ConnectionStatus.OK
        await asyncio.sleep(1.5 * INTERVAL)
        assert monitor.status == ConnectionStatus.OK
        await asyncio.sleep(INTERVAL)
        assert monitor.status == ConnectionStatus.DEGRADED
        monitor.close()

    async def test_a_failed_listen_is_not_data(self) -> None:
        monitor, _ = _monitor(INTERVAL)
        monitor.watch()
        await asyncio.sleep((SILENCE_ERROR_MULTIPLIER + 0.5) * INTERVAL)
        monitor.record(LISTEN, "a", ValueError("bad frame"))
        assert monitor.status == ConnectionStatus.ERROR
        monitor.close()

    async def test_close_ends_silence_detection(self) -> None:
        monitor, publish = _monitor(INTERVAL)
        monitor.watch()
        await asyncio.sleep((SILENCE_ERROR_MULTIPLIER + 0.5) * INTERVAL)
        monitor.close()
        publish.reset_mock()
        monitor.record(READ, "a")
        await asyncio.sleep(10 * INTERVAL)
        assert _published(publish) == [ConnectionStatus.OK]

    async def test_data_after_close_does_not_restart_detection(self) -> None:
        monitor, publish = _monitor(INTERVAL)
        monitor.watch()
        monitor.close()
        monitor.record(LISTEN, "a")
        await asyncio.sleep(10 * INTERVAL)
        assert _published(publish) == [ConnectionStatus.OK]

    async def test_close_is_idempotent(self) -> None:
        monitor, _ = _monitor(INTERVAL)
        monitor.close()
        monitor.watch()
        monitor.close()
        monitor.close()
