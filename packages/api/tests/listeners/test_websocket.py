from datetime import UTC, datetime
from unittest.mock import AsyncMock, MagicMock

import pytest

from api.listeners.websocket import broadcast_attribute_update, broadcast_device_update
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


async def test_full_update_broadcast_preserves_presentation_reference():
    from unittest.mock import patch

    from api.websocket.schemas import DeviceFullUpdateMessage
    from devices_manager.dto import Device
    from devices_manager.dto.presentation_dto import PresentationReference

    manager = AsyncMock(spec=WebSocketManager)
    device = _make_device()
    projected = Device.model_validate(
        {
            "id": "dev-1",
            "name": "Device",
            "driver_id": "demo",
            "transport_id": "transport",
            "config": {},
            "presentation_ref": {"revision": "presentation-revision"},
        }
    )
    with patch("api.listeners.websocket.device_to_public", return_value=projected):
        pending = broadcast_device_update(manager)(device)
        assert pending is not None
        await pending
    manager.broadcast.assert_awaited_once()
    message = manager.broadcast.await_args.args[0]
    assert isinstance(message, DeviceFullUpdateMessage)
    assert message.device.presentation_ref == PresentationReference(
        revision="presentation-revision"
    )
    assert message.model_dump(mode="json")["device"]["presentation_ref"] == {
        "revision": "presentation-revision"
    }


async def test_write_state_event_carries_resolution_without_a_measurement():
    from api.listeners.websocket import broadcast_write_state
    from models.write_rules import AttributeWriteState, WriteReason

    device = _make_device()
    device.write_state_revision = 3
    device.presentation_state = {"/page/visible": False}
    attribute = _make_attribute()
    attribute.write_state = AttributeWriteState(status="unknown")
    attribute.raw_value = 7
    attribute.resolution_error = WriteReason(code="invalid_mapping_code")
    device.attributes = {"temperature": attribute}
    manager = AsyncMock(spec=WebSocketManager)
    pending = broadcast_write_state(manager)(device)
    assert pending is not None
    await pending
    message = manager.broadcast.await_args.args[0].model_dump(mode="json")
    assert message["type"] == "device_write_state"
    assert message["revision"] == 3
    assert message["resolutions"]["temperature"]["raw_value"] == 7
    assert "current_value" not in message["attributes"]["temperature"]
    assert "value" not in message
