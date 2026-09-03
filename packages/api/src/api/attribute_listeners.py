from collections.abc import Awaitable, Callable
from datetime import UTC, datetime

from api.websocket.manager import WebSocketManager
from api.websocket.schemas import DeviceUpdateMessage
from devices_manager import Attribute, CoreDevice, DevicesServiceInterface
from timeseries import DataPoint, SeriesKey, TimeSeriesService

# Narrower than devices_manager.AttributeListener (which also allows a
# synchronous `None` return): both factories below always build async
# listeners, and a Callable[..., Awaitable[None]] is assignable wherever
# add_device_attribute_listener expects the broader alias.
_AsyncAttributeListener = Callable[
    [CoreDevice, str, Attribute | None, Attribute], Awaitable[None]
]


def on_attribute_broadcast(
    websocket_manager: WebSocketManager,
) -> _AsyncAttributeListener:
    """Listener: broadcast attribute updates to websocket clients."""

    async def listener(
        device: CoreDevice,
        attribute_name: str,
        _previous: Attribute | None,
        attribute: Attribute,
    ) -> None:
        message = DeviceUpdateMessage(
            device_id=device.id,
            attribute=attribute_name,
            value=attribute.current_value,
            last_updated=attribute.last_updated,
            last_changed=attribute.last_changed,
        )
        await websocket_manager.broadcast(message)

    return listener


def on_attribute_persist(ts_service: TimeSeriesService) -> _AsyncAttributeListener:
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


def register_attribute_listeners(
    dm: DevicesServiceInterface,
    websocket_manager: WebSocketManager,
    ts_service: TimeSeriesService,
) -> None:
    """Register the broadcast and persist listeners as independent handlers.

    Kept as its own function (rather than two calls inline in the app
    lifespan) so the registration itself is unit-testable: the lifespan body
    that would otherwise contain these calls never runs under test.
    """
    dm.add_device_attribute_listener(on_attribute_broadcast(websocket_manager))
    dm.add_device_attribute_listener(on_attribute_persist(ts_service))
