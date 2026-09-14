import pytest

from devices_manager.core.device.connection_health import ConnectionHealth
from devices_manager.core.device.event_journal import LogCounts
from devices_manager.types import ConnectionStatus

EMPTY = LogCounts(errors=0, total=0)
OK = LogCounts(errors=0, total=3)
MIXED = LogCounts(errors=1, total=3)
FAILED = LogCounts(errors=3, total=3)


def _health(*reports: tuple[str, list[LogCounts]]) -> ConnectionHealth:
    health = ConnectionHealth()
    for attribute, logs in reports:
        health.track(attribute, logs)
    return health


class TestStatusFromLogs:
    @pytest.mark.parametrize(
        ("reports", "expected"),
        [
            ([], ConnectionStatus.IDLE),
            ([("a", [EMPTY, EMPTY])], ConnectionStatus.IDLE),
            ([("a", [OK, EMPTY])], ConnectionStatus.OK),
            ([("a", [OK, OK]), ("b", [EMPTY, OK])], ConnectionStatus.OK),
            ([("a", [FAILED, EMPTY])], ConnectionStatus.ERROR),
            ([("a", [FAILED, FAILED]), ("b", [FAILED, EMPTY])], ConnectionStatus.ERROR),
            ([("a", [MIXED, EMPTY])], ConnectionStatus.DEGRADED),
            # outcomes are pooled across an attribute's logs
            ([("a", [FAILED, OK])], ConnectionStatus.DEGRADED),
            # and across attributes
            ([("a", [OK, EMPTY]), ("b", [FAILED, EMPTY])], ConnectionStatus.DEGRADED),
            ([("a", [OK, EMPTY]), ("b", [MIXED, EMPTY])], ConnectionStatus.DEGRADED),
            # attributes without entries do not count
            ([("a", [FAILED, EMPTY]), ("b", [EMPTY, EMPTY])], ConnectionStatus.ERROR),
        ],
    )
    def test_status(
        self, reports: list[tuple[str, list[LogCounts]]], expected: ConnectionStatus
    ) -> None:
        assert _health(*reports).status == expected

    @pytest.mark.parametrize(
        ("latest", "expected"),
        [
            ([OK, EMPTY], ConnectionStatus.OK),
            ([MIXED, EMPTY], ConnectionStatus.DEGRADED),
            ([FAILED, EMPTY], ConnectionStatus.ERROR),
            ([EMPTY, EMPTY], ConnectionStatus.IDLE),
        ],
    )
    def test_latest_report_replaces_the_previous_one(
        self, latest: list[LogCounts], expected: ConnectionStatus
    ) -> None:
        health = _health(("a", [FAILED, EMPTY]), ("a", [MIXED, EMPTY]))
        health.track("a", latest)
        assert health.status == expected

    def test_many_attributes_moving_between_classes(self) -> None:
        health = ConnectionHealth()
        names = [f"point_{i}" for i in range(50)]
        for name in names:
            health.track(name, [FAILED, EMPTY])
        assert health.status == ConnectionStatus.ERROR
        for name in names[:-1]:
            health.track(name, [OK, EMPTY])
        assert health.status == ConnectionStatus.DEGRADED
        health.track(names[-1], [OK, EMPTY])
        assert health.status == ConnectionStatus.OK


class TestForgetAndRename:
    def test_forget_removes_the_attribute(self) -> None:
        health = _health(("a", [OK, EMPTY]), ("b", [FAILED, EMPTY]))
        health.forget("b")
        assert health.status == ConnectionStatus.OK

    def test_forget_last_attribute_goes_idle(self) -> None:
        health = _health(("a", [OK, EMPTY]))
        health.forget("a")
        assert health.status == ConnectionStatus.IDLE

    def test_forget_unknown_attribute_is_a_no_op(self) -> None:
        health = _health(("a", [OK, EMPTY]))
        health.forget("b")
        assert health.status == ConnectionStatus.OK

    def test_renamed_attribute_keeps_its_class(self) -> None:
        health = _health(("a", [OK, EMPTY]), ("b", [FAILED, EMPTY]))
        health.rename("b", "c")
        health.track("a", [FAILED, EMPTY])
        assert health.status == ConnectionStatus.ERROR
        health.track("c", [OK, EMPTY])
        assert health.status == ConnectionStatus.DEGRADED

    def test_rename_unknown_attribute_is_a_no_op(self) -> None:
        health = _health(("a", [OK, EMPTY]))
        health.rename("b", "c")
        assert health.status == ConnectionStatus.OK


class TestSilence:
    @pytest.mark.parametrize(
        ("reports", "silence", "expected"),
        [
            ([], ConnectionStatus.DEGRADED, ConnectionStatus.DEGRADED),
            ([], ConnectionStatus.ERROR, ConnectionStatus.ERROR),
            (
                [("a", [OK, EMPTY])],
                ConnectionStatus.DEGRADED,
                ConnectionStatus.DEGRADED,
            ),
            ([("a", [OK, EMPTY])], ConnectionStatus.ERROR, ConnectionStatus.ERROR),
            ([("a", [MIXED, EMPTY])], ConnectionStatus.ERROR, ConnectionStatus.ERROR),
            # the logs win when they are worse than the silence
            (
                [("a", [FAILED, EMPTY])],
                ConnectionStatus.DEGRADED,
                ConnectionStatus.ERROR,
            ),
        ],
    )
    def test_status_is_the_worse_of_silence_and_logs(
        self,
        reports: list[tuple[str, list[LogCounts]]],
        silence: ConnectionStatus,
        expected: ConnectionStatus,
    ) -> None:
        health = _health(*reports)
        health.report_silence(silence)
        assert health.status == expected

    def test_new_log_outcomes_do_not_clear_silence(self) -> None:
        health = ConnectionHealth()
        health.report_silence(ConnectionStatus.ERROR)
        health.track("a", [MIXED, EMPTY])
        assert health.status == ConnectionStatus.ERROR

    def test_clearing_silence_hands_back_to_the_logs(self) -> None:
        health = _health(("a", [MIXED, EMPTY]))
        health.report_silence(ConnectionStatus.ERROR)
        health.report_silence(None)
        assert health.status == ConnectionStatus.DEGRADED
