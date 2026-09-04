from datetime import UTC, datetime
from unittest.mock import AsyncMock, MagicMock

import pytest

from api.listeners.websocket import broadcast_attribute_update
from api.websocket.manager import WebSocketManager
from devices_manager import Attribute
from devices_manager.types import DataType

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


class TestBroadcastAttributeUpdate:
    async def test_broadcasts_device_update_message(self):
        websocket_manager = AsyncMock(spec=WebSocketManager)
        listener = broadcast_attribute_update(websocket_manager)

        device = _make_device("dev-1")
        await listener(device, "temperature", None, _make_attribute(21.0))

        websocket_manager.broadcast.assert_awaited_once()
        message = websocket_manager.broadcast.call_args.args[0]
        assert message.device_id == "dev-1"
        assert message.attribute == "temperature"
        assert message.value == 21.0
