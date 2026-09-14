from __future__ import annotations

import pytest

from devices_manager.core.device.connection_status.events import (
    AttributeEventLog,
    EventType,
)


class TestAttributeEventLogFactories:
    def test_ok_builds_an_ok_entry(self) -> None:
        entry = AttributeEventLog.ok(EventType.READ)
        assert (entry.event_type, entry.status, entry.message) == (
            EventType.READ,
            "ok",
            None,
        )

    def test_error_keeps_the_exception_message(self) -> None:
        entry = AttributeEventLog.error(EventType.WRITE, RuntimeError("boom"))
        assert (entry.event_type, entry.status, entry.message) == (
            EventType.WRITE,
            "error",
            "boom",
        )

    @pytest.mark.parametrize(
        ("error", "status"), [(None, "ok"), (RuntimeError("boom"), "error")]
    )
    def test_new_picks_ok_or_error(self, error: Exception | None, status: str) -> None:
        assert AttributeEventLog.new(EventType.LISTEN, error).status == status
