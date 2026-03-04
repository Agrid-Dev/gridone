from __future__ import annotations  # noqa: INP001

from datetime import UTC, datetime
from typing import Any

from timeseries.domain import CommandStatus, DataType, DeviceCommandCreate


def make_command(  # noqa: PLR0913
    *,
    device_id: str = "device1",
    attribute: str = "mode",
    user_id: str = "user1",
    value: Any = "auto",  # noqa: ANN401
    data_type: DataType = DataType.STRING,
    timestamp: datetime = datetime(2026, 1, 2, tzinfo=UTC),
) -> DeviceCommandCreate:
    return DeviceCommandCreate(
        device_id=device_id,
        attribute=attribute,
        user_id=user_id,
        value=value,
        data_type=data_type,
        status=CommandStatus.SUCCESS,
        timestamp=timestamp,
        status_details=None,
    )
