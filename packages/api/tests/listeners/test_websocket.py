from collections.abc import Callable
from datetime import UTC, datetime
from typing import Any
from unittest.mock import AsyncMock, MagicMock

import pytest

from api.access import UNRESTRICTED, AccessPolicy
from api.listeners.websocket import broadcast_attribute_update, broadcast_device_update
from api.websocket.manager import WebSocketManager
from devices_manager import Attribute
from devices_manager.types import DataType
from users.permissions import Permission
from users.roles import DeviceScope, Role

pytestmark = pytest.mark.asyncio

_NOW = datetime(2026, 1, 1, tzinfo=UTC)


def _make_device(device_id: str = "dev-1") -> MagicMock:
    device = MagicMock()
    device.id = device_id
    device.type = "thermostat"
    device.driver_id = "vendor"
    return device


def _temperature_only() -> AccessPolicy:
    return AccessPolicy.from_role(
        Role(
            id="r",
            name="r",
            permissions=[Permission.DEVICES_READ],
            scopes={Permission.DEVICES_READ: [DeviceScope(attributes=["temperature"])]},
        )
    )


def _projector(manager: AsyncMock) -> Callable[[AccessPolicy], Any]:
    return manager.broadcast.await_args.kwargs["project"]


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
        await listener(
            device, "temperature", None, _make_attribute(21.0), initial=False
        )

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


class TestProjection:
    """Each listener hands the manager the message a policy may receive."""

    async def test_attribute_update_is_withheld_from_a_role_that_cannot_read_it(self):
        manager = AsyncMock(spec=WebSocketManager)
        device = _make_device()
        await broadcast_attribute_update(manager)(
            device, "mode", None, _make_attribute()
        )
        visible = _projector(manager)

        assert visible(UNRESTRICTED) is manager.broadcast.await_args.args[0]
        assert visible(_temperature_only()) is None

    async def test_attribute_update_reaches_a_role_that_can_read_it(self):
        manager = AsyncMock(spec=WebSocketManager)
        await broadcast_attribute_update(manager)(
            _make_device(), "temperature", None, _make_attribute()
        )

        assert _projector(manager)(_temperature_only()) is not None

    async def test_full_update_is_projected_or_withheld(self):
        from unittest.mock import patch

        from devices_manager.dto import Device

        public = Device.model_validate(
            {
                "id": "dev-1",
                "name": "Device",
                "type": "thermostat",
                "driver_id": "vendor",
                "transport_id": "t",
                "config": {},
                "attributes": {
                    "temperature": _make_attribute(),
                    "mode": _make_attribute(),
                },
            }
        )
        manager = AsyncMock(spec=WebSocketManager)
        with patch("api.listeners.websocket.device_to_public", return_value=public):
            pending = broadcast_device_update(manager)(_make_device())
            assert pending is not None
            await pending
        visible = _projector(manager)

        projected = visible(_temperature_only())
        assert projected is not None
        assert list(projected.device.attributes) == ["temperature"]
        nothing = AccessPolicy.from_role(
            Role(
                id="r",
                name="r",
                permissions=[Permission.DEVICES_READ],
                scopes={
                    Permission.DEVICES_READ: [DeviceScope(attributes=["humidity"])]
                },
            )
        )
        assert visible(nothing) is None

    async def test_write_state_is_filtered_to_readable_attributes(self):
        from api.listeners.websocket import broadcast_write_state
        from models.write_rules import AttributeWriteState

        device = _make_device()
        device.write_state_revision = 1
        temperature, mode = _make_attribute(), _make_attribute()
        temperature.write_state = AttributeWriteState(status="unknown")
        mode.write_state = AttributeWriteState(status="unknown")
        device.attributes = {"temperature": temperature, "mode": mode}
        manager = AsyncMock(spec=WebSocketManager)
        pending = broadcast_write_state(manager)(device)
        assert pending is not None
        await pending
        visible = _projector(manager)

        projected = visible(_temperature_only())
        assert projected is not None
        assert list(projected.attributes) == ["temperature"]
        assert list(projected.resolutions) == ["temperature"]
        assert visible(UNRESTRICTED) is manager.broadcast.await_args.args[0]
