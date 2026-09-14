from datetime import UTC, datetime

import pytest

from devices_manager.core.device.connection_status.events import (
    AttributeEventLog,
    EventType,
)
from devices_manager.core.device.event_journal import EventJournal, LogCounts

_NOW = datetime(2026, 1, 1, tzinfo=UTC)


def _entry(
    status: str = "ok",
    event_type: EventType = EventType.READ,
    message: str | None = None,
) -> AttributeEventLog:
    return AttributeEventLog(
        event_type=event_type,
        timestamp=_NOW,
        status=status,  # type: ignore[arg-type]
        message=message,
    )


class TestLogs:
    def test_unknown_attribute_has_empty_logs(self) -> None:
        logs = EventJournal().logs("temperature")
        assert logs.read == []
        assert logs.write == []
        assert logs.listen == []

    def test_entries_are_kept_per_event_type(self) -> None:
        journal = EventJournal()
        journal.record("temperature", _entry(event_type=EventType.READ))
        journal.record("temperature", _entry(event_type=EventType.WRITE))
        logs = journal.logs("temperature")
        assert len(logs.read) == 1
        assert len(logs.write) == 1
        assert logs.listen == []

    def test_entries_are_kept_per_attribute(self) -> None:
        journal = EventJournal()
        journal.record("temperature", _entry())
        assert journal.logs("humidity").read == []

    def test_newest_entry_comes_first(self) -> None:
        journal = EventJournal()
        journal.record("temperature", _entry("ok"))
        journal.record("temperature", _entry("error", message="Connection refused"))
        read = journal.logs("temperature").read
        assert [e.status for e in read] == ["error", "ok"]
        assert read[0].message == "Connection refused"

    def test_each_log_keeps_the_last_ten_entries(self) -> None:
        journal = EventJournal()
        for _ in range(15):
            journal.record("temperature", _entry())
        assert len(journal.logs("temperature").read) == 10

    def test_logs_are_a_copy(self) -> None:
        journal = EventJournal()
        journal.logs("temperature").read.append(_entry())
        assert journal.logs("temperature").read == []


class TestCounts:
    def test_unknown_attribute_counts_nothing(self) -> None:
        assert EventJournal().counts("temperature", EventType.READ) == LogCounts(0, 0)

    @pytest.mark.parametrize(
        ("statuses", "expected"),
        [
            (["ok"], LogCounts(errors=0, total=1)),
            (["error"], LogCounts(errors=1, total=1)),
            (["ok", "error", "error"], LogCounts(errors=2, total=3)),
            # the first entry is evicted once the log holds ten
            (["error"] + ["ok"] * 10, LogCounts(errors=0, total=10)),
            (["ok"] + ["error"] * 10, LogCounts(errors=10, total=10)),
            (["error"] * 3 + ["ok"] * 9, LogCounts(errors=1, total=10)),
        ],
    )
    def test_counts_follow_the_retained_entries(
        self, statuses: list[str], expected: LogCounts
    ) -> None:
        journal = EventJournal()
        for status in statuses:
            journal.record("temperature", _entry(status))
        assert journal.counts("temperature", EventType.READ) == expected

    def test_counts_are_per_event_type(self) -> None:
        journal = EventJournal()
        journal.record("temperature", _entry("error", EventType.READ))
        journal.record("temperature", _entry("ok", EventType.LISTEN))
        assert journal.counts("temperature", EventType.READ) == LogCounts(1, 1)
        assert journal.counts("temperature", EventType.LISTEN) == LogCounts(0, 1)


class TestForgetAndRename:
    def test_forget_drops_logs_and_counts(self) -> None:
        journal = EventJournal()
        journal.record("temperature", _entry("error"))
        journal.forget("temperature")
        assert journal.logs("temperature").read == []
        assert journal.counts("temperature", EventType.READ) == LogCounts(0, 0)

    def test_forget_unknown_attribute_is_a_no_op(self) -> None:
        EventJournal().forget("temperature")

    def test_rename_moves_logs_and_counts(self) -> None:
        journal = EventJournal()
        journal.record("temperature", _entry("error"))
        original = journal.logs("temperature")
        journal.rename("temperature", "temp")
        assert journal.logs("temp") == original
        assert journal.counts("temp", EventType.READ) == LogCounts(1, 1)
        assert journal.logs("temperature").read == []

    def test_rename_unknown_attribute_is_a_no_op(self) -> None:
        journal = EventJournal()
        journal.rename("temperature", "temp")
        assert journal.logs("temp").read == []
