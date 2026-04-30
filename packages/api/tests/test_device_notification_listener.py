from unittest.mock import AsyncMock, MagicMock

import pytest
from notifications.interface import NotificationsServiceInterface

from api.notification_listeners.device import on_device_discovered


def _make_notifications() -> AsyncMock:
    return AsyncMock(spec=NotificationsServiceInterface)


def _make_recipients(user_ids: list[str] | None = None) -> AsyncMock:
    return AsyncMock(return_value=user_ids or [])


def _make_device(device_id: str = "dev-1", name: str = "Chiller") -> MagicMock:
    device = MagicMock()
    device.id = device_id
    device.name = name
    return device


class TestDeviceDiscoveredListener:
    pytestmark = pytest.mark.asyncio

    async def test_dispatches_on_discovery(self):
        notifications = _make_notifications()
        listener = on_device_discovered(notifications, _make_recipients(["u1"]))

        await listener(_make_device())

        notifications.dispatch.assert_called_once()

    async def test_title_is_new_device_discovered(self):
        notifications = _make_notifications()
        listener = on_device_discovered(notifications, _make_recipients(["u1"]))

        await listener(_make_device())

        call = notifications.dispatch.call_args
        assert call.kwargs["title"] == "New device discovered"

    async def test_body_includes_device_name(self):
        notifications = _make_notifications()
        listener = on_device_discovered(notifications, _make_recipients(["u1"]))

        await listener(_make_device(name="Boiler"))

        call = notifications.dispatch.call_args
        assert "Boiler" in call.kwargs["body"]

    async def test_correlation_id_is_device_id(self):
        notifications = _make_notifications()
        listener = on_device_discovered(notifications, _make_recipients(["u1"]))

        await listener(_make_device(device_id="dev-42"))

        call = notifications.dispatch.call_args
        assert call.kwargs["correlation_id"] == "dev-42"

    async def test_dispatch_uses_recipients_ids(self):
        notifications = _make_notifications()
        listener = on_device_discovered(notifications, _make_recipients(["u1", "u2"]))

        await listener(_make_device())

        call = notifications.dispatch.call_args
        assert call.kwargs["user_ids"] == ["u1", "u2"]

    async def test_no_recipients_still_dispatches(self):
        notifications = _make_notifications()
        listener = on_device_discovered(notifications, _make_recipients([]))

        await listener(_make_device())

        notifications.dispatch.assert_called_once()
        call = notifications.dispatch.call_args
        assert call.kwargs["user_ids"] == []
