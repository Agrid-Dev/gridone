from datetime import UTC, datetime

from api.listeners import AttributeListener
from devices_manager import Attribute, CoreDevice
from timeseries import DataPoint, SeriesKey, TimeSeriesService


def historise_attribute_update(ts_service: TimeSeriesService) -> AttributeListener:
    """Listener: store attribute updates in the time series."""

    async def listener(
        device: CoreDevice,
        attribute_name: str,
        _previous: Attribute | None,
        attribute: Attribute,
    ) -> None:
        await ts_service.upsert_points(
            SeriesKey(owner_id=device.id, metric=attribute_name),
            [
                DataPoint(
                    timestamp=attribute.last_changed or datetime.now(UTC),
                    value=attribute.current_value,  # ty: ignore[invalid-argument-type]
                )
            ],
            create_if_not_found=True,
            validate_data_type=attribute.data_type,
        )

    return listener
