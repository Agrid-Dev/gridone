from __future__ import annotations  # noqa: INP001

from datetime import UTC, datetime

from timeseries.domain import DataType, DeviceCommandCreate


def make_command(
    *,
    device_id: str = "device1",
    attribute: str = "mode",
    user_id: str = "user1",
    timestamp: datetime = datetime(2026, 1, 2, tzinfo=UTC),
) -> DeviceCommandCreate:
    return DeviceCommandCreate(
        device_id=device_id,
        attribute=attribute,
        user_id=user_id,
        value="auto",
        data_type=DataType.STRING,
        status="success",
        timestamp=timestamp,
        status_details=None,
    )
