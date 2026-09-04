from datetime import UTC, datetime

from api.listeners import AttributeListener
from devices_manager import Attribute, CoreDevice
from models.types import AttributeValueType, DataType
from timeseries import DataPoint, SeriesKey, TimeSeriesService


async def record_attribute_point(
    ts_service: TimeSeriesService,
    device_id: str,
    attribute: str,
    value: AttributeValueType,
    data_type: DataType,
    last_changed: datetime | None,
    command_id: int | None = None,
) -> None:
    """Write a single attribute value as a timeseries point."""
    await ts_service.upsert_points(
        SeriesKey(owner_id=device_id, metric=attribute),
        [
            DataPoint(
                timestamp=last_changed or datetime.now(UTC),
                value=value,
                command_id=command_id,
            )
        ],
        create_if_not_found=True,
        validate_data_type=data_type,
    )


def historise_attribute_update(ts_service: TimeSeriesService) -> AttributeListener:
    """Listener: store attribute updates in the time series."""

    async def listener(
        device: CoreDevice,
        attribute_name: str,
        _previous: Attribute | None,
        attribute: Attribute,
    ) -> None:
        await record_attribute_point(
            ts_service,
            device.id,
            attribute_name,
            attribute.current_value,  # ty: ignore[invalid-argument-type]
            attribute.data_type,
            attribute.last_changed,
        )

    return listener
