from datetime import UTC, datetime

import pytest

from devices_manager.core.device.connection_status import (
    ConnectionStatus,
    compute_connection_status,
)
from devices_manager.core.device.event_log import AttributeEventLog, EventType

_NOW = datetime(2026, 1, 1, tzinfo=UTC)


def _entry(status: str) -> AttributeEventLog:
    return AttributeEventLog(
        event_type=EventType.READ,
        timestamp=_NOW,
        status=status,  # type: ignore[arg-type]
    )


@pytest.mark.parametrize(
    ("entries", "expected"),
    [
        ([], ConnectionStatus.IDLE),
        ([_entry("ok")], ConnectionStatus.OK),
        ([_entry("ok"), _entry("ok")], ConnectionStatus.OK),
        ([_entry("error")], ConnectionStatus.ERROR),
        ([_entry("error"), _entry("error")], ConnectionStatus.ERROR),
        ([_entry("ok"), _entry("error")], ConnectionStatus.DEGRADED),
        ([_entry("error"), _entry("ok"), _entry("ok")], ConnectionStatus.DEGRADED),
    ],
)
def test_compute_connection_status(
    entries: list[AttributeEventLog], expected: ConnectionStatus
) -> None:
    assert compute_connection_status(entries) == expected
