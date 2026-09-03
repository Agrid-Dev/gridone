from datetime import UTC, datetime
from unittest.mock import AsyncMock, MagicMock

import pytest

from api.attribute_listeners import (
    on_attribute_broadcast,
    on_attribute_persist,
    register_attribute_listeners,
)
from api.websocket.manager import WebSocketManager
from devices_manager import Attribute, DevicesServiceInterface
from devices_manager.types import DataType
from timeseries import TimeSeriesService
from timeseries.domain import SeriesKey

pytestmark = pytest.mark.asyncio

_NOW = datetime(2026, 1, 1, tzinfo=UTC)


def _make_device(device_id: str = "dev-1") -> MagicMock:
    device = MagicMock()
    device.id = device_id
    return device


def _make_attribute(value: float = 21.0) -> Attribute:
    return Attribute(
        name="temperature",
        data_type=DataType.FLOAT,
        read_write_modes={"read"},
        current_value=value,
        last_updated=_NOW,
        last_changed=_NOW,
    )


class TestOnAttributeBroadcast:
    async def test_broadcasts_device_update_message(self):
        websocket_manager = AsyncMock(spec=WebSocketManager)
        listener = on_attribute_broadcast(websocket_manager)

        device = _make_device("dev-1")
        await listener(device, "temperature", None, _make_attribute(21.0))

        websocket_manager.broadcast.assert_awaited_once()
        message = websocket_manager.broadcast.call_args.args[0]
        assert message.device_id == "dev-1"
        assert message.attribute == "temperature"
        assert message.value == 21.0

    async def test_broadcast_failure_propagates_to_caller(self):
        websocket_manager = AsyncMock(spec=WebSocketManager)
        websocket_manager.broadcast.side_effect = RuntimeError("boom")
        listener = on_attribute_broadcast(websocket_manager)

        with pytest.raises(RuntimeError, match="boom"):
            await listener(_make_device(), "temperature", None, _make_attribute())


class TestOnAttributePersist:
    async def test_upserts_point_with_attribute_value(self):
        ts_service = AsyncMock(spec=TimeSeriesService)
        listener = on_attribute_persist(ts_service)

        device = _make_device("dev-1")
        await listener(device, "temperature", None, _make_attribute(21.0))

        ts_service.upsert_points.assert_awaited_once()
        key, points = ts_service.upsert_points.call_args.args
        assert key == SeriesKey(owner_id="dev-1", metric="temperature")
        assert points[0].value == 21.0

    async def test_is_unaffected_by_broadcast_listener_raising(self):
        """The two listeners are independent: this listener never even
        references the broadcast listener, so a broadcast failure has no
        way to prevent the point from being written.
        """
        ts_service = AsyncMock(spec=TimeSeriesService)
        websocket_manager = AsyncMock(spec=WebSocketManager)
        websocket_manager.broadcast.side_effect = RuntimeError("boom")

        broadcast_listener = on_attribute_broadcast(websocket_manager)
        persist_listener = on_attribute_persist(ts_service)

        device = _make_device("dev-1")
        attribute = _make_attribute(21.0)

        with pytest.raises(RuntimeError):
            await broadcast_listener(device, "temperature", None, attribute)
        await persist_listener(device, "temperature", None, attribute)

        ts_service.upsert_points.assert_awaited_once()


class TestRegisterAttributeListeners:
    async def test_registers_both_listeners_on_the_devices_service(self):
        dm = MagicMock(spec=DevicesServiceInterface)
        websocket_manager = AsyncMock(spec=WebSocketManager)
        ts_service = AsyncMock(spec=TimeSeriesService)

        register_attribute_listeners(dm, websocket_manager, ts_service)

        assert dm.add_device_attribute_listener.call_count == 2
