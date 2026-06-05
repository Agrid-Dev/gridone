from datetime import UTC, datetime
from typing import TYPE_CHECKING, Final

from devices_manager.types import ConnectionStatus, DataType

from .attribute import InternalAttribute

if TYPE_CHECKING:
    from .event_log import AttributeEventLog

CONNECTION_STATUS_ATTR: Final = "connection_status"

_STATUS_BY_OUTCOMES: dict[str, ConnectionStatus] = {
    "ok": ConnectionStatus.OK,
    "error": ConnectionStatus.ERROR,
}


def build_cs_attribute(initial_value: str | None) -> InternalAttribute:
    now = datetime.now(UTC) if initial_value is not None else None
    return InternalAttribute(
        name=CONNECTION_STATUS_ATTR,
        data_type=DataType.STRING,
        read_write_modes={"read"},
        current_value=initial_value or ConnectionStatus.IDLE,
        last_updated=now,
        last_changed=now,
        value_options=list(ConnectionStatus),
    )


def compute_connection_status(entries: "list[AttributeEventLog]") -> ConnectionStatus:
    """Derive connection health from a flat list of event-log entries.

    Maps the set of distinct outcome statuses to a ConnectionStatus:
      {}          → idle  (no activity observed yet)
      {"ok"}      → ok
      {"error"}   → error
      {"ok","error"} → degraded
    """
    statuses = frozenset(e.status for e in entries)
    if not statuses:
        return ConnectionStatus.IDLE
    if len(statuses) > 1:
        return ConnectionStatus.DEGRADED
    return _STATUS_BY_OUTCOMES[next(iter(statuses))]
