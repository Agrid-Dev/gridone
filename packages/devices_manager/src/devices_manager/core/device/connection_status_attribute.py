from datetime import UTC, datetime
from typing import Final

from devices_manager.types import ConnectionStatus, DataType

from .attribute import Attribute, AttributeKind

CONNECTION_STATUS_ATTR: Final = "connection_status"


def build_cs_attribute(
    initial_value: str | None,
    *,
    restored: Attribute | None = None,
) -> Attribute:
    if restored is not None:
        current_value = restored.current_value or ConnectionStatus.IDLE
        last_updated = restored.last_updated
        last_changed = restored.last_changed
    else:
        now = datetime.now(UTC) if initial_value is not None else None
        current_value = initial_value or ConnectionStatus.IDLE
        last_updated = now
        last_changed = now
    return Attribute(
        name=CONNECTION_STATUS_ATTR,
        kind=AttributeKind.INTERNAL,
        data_type=DataType.STRING,
        read_write_modes={"read"},
        current_value=current_value,
        last_updated=last_updated,
        last_changed=last_changed,
        value_options=list(ConnectionStatus),
    )
