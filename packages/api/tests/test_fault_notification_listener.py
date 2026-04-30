from datetime import UTC, datetime
from unittest.mock import AsyncMock, MagicMock

import pytest
from devices_manager import Attribute, FaultAttribute
from devices_manager.interface import DevicesServiceInterface
from devices_manager.types import AttributeValueType, DataType
from models.types import Severity
from notifications.interface import NotificationsServiceInterface

from api.notification_listeners.fault import FaultNotificationListener

_NOW = datetime(2026, 1, 1, tzinfo=UTC)


def _make_dm() -> MagicMock:
    return MagicMock(spec=DevicesServiceInterface)


def _make_um(users: list | None = None) -> AsyncMock:
    um = AsyncMock()
    um.list_users.return_value = users or []
    return um


def _make_notifications() -> AsyncMock:
    return AsyncMock(spec=NotificationsServiceInterface)


def _make_device(device_id: str = "dev-1", name: str = "Chiller") -> MagicMock:
    device = MagicMock()
    device.id = device_id
    device.name = name
    return device


def _make_user(user_id: str, *, is_blocked: bool = False) -> MagicMock:
    user = MagicMock()
    user.id = user_id
    user.is_blocked = is_blocked
    return user


def _make_standard_attr(value: AttributeValueType = 42) -> Attribute:
    return Attribute(
        name="temperature",
        data_type=DataType.INT,
        read_write_modes={"read"},
        current_value=value,
        last_updated=_NOW,
        last_changed=_NOW,
    )


def _make_fault_attr(
    *,
    current_value: AttributeValueType,
    healthy_values: list,
    severity: Severity = Severity.WARNING,
    name: str = "alarm",
    data_type: DataType = DataType.BOOL,
) -> FaultAttribute:
    return FaultAttribute(
        name=name,
        data_type=data_type,
        read_write_modes={"read"},
        current_value=current_value,
        healthy_values=healthy_values,
        severity=severity,
        last_updated=_NOW,
        last_changed=_NOW,
    )


async def _fire(
    dm: MagicMock,
    device: MagicMock,
    attr_name: str,
    previous: Attribute | None,
    attribute: Attribute,
) -> None:
    captured = dm.add_device_attribute_listener.call_args[0][0]
    await captured(device, attr_name, previous, attribute)


class TestFaultNotificationListenerRegistration:
    def test_register_adds_attribute_listener(self):
        dm = _make_dm()
        listener = FaultNotificationListener(dm, _make_um(), _make_notifications())
        listener.register()
        dm.add_device_attribute_listener.assert_called_once()


class TestFaultNotificationListenerDispatch:
    pytestmark = pytest.mark.asyncio

    async def test_standard_attribute_ignored(self):
        dm = _make_dm()
        notifications = _make_notifications()
        listener = FaultNotificationListener(dm, _make_um(), notifications)
        listener.register()

        await _fire(dm, _make_device(), "temperature", None, _make_standard_attr())

        notifications.dispatch.assert_not_called()

    async def test_none_previous_to_faulty_dispatches_alert(self):
        dm = _make_dm()
        notifications = _make_notifications()
        um = _make_um([_make_user("u1")])
        listener = FaultNotificationListener(dm, um, notifications)
        listener.register()

        faulty = _make_fault_attr(current_value=True, healthy_values=[False])
        await _fire(dm, _make_device(), "alarm", None, faulty)

        notifications.dispatch.assert_called_once()
        call = notifications.dispatch.call_args
        assert call.kwargs["severity"] == Severity.WARNING
        assert "New fault" in call.kwargs["title"]

    async def test_none_previous_to_healthy_no_dispatch(self):
        dm = _make_dm()
        notifications = _make_notifications()
        listener = FaultNotificationListener(dm, _make_um(), notifications)
        listener.register()

        healthy = _make_fault_attr(current_value=False, healthy_values=[False])
        await _fire(dm, _make_device(), "alarm", None, healthy)

        notifications.dispatch.assert_not_called()

    @pytest.mark.parametrize(
        "severity", [Severity.INFO, Severity.WARNING, Severity.ALERT]
    )
    async def test_healthy_to_faulty_dispatches_with_attribute_severity(
        self, severity: Severity
    ):
        dm = _make_dm()
        notifications = _make_notifications()
        um = _make_um([_make_user("u1")])
        listener = FaultNotificationListener(dm, um, notifications)
        listener.register()

        healthy = _make_fault_attr(
            current_value=False, healthy_values=[False], severity=severity
        )
        faulty = _make_fault_attr(
            current_value=True, healthy_values=[False], severity=severity
        )
        await _fire(dm, _make_device(), "alarm", healthy, faulty)

        notifications.dispatch.assert_called_once()
        call = notifications.dispatch.call_args
        assert call.kwargs["severity"] == severity
        assert "New fault" in call.kwargs["title"]
        assert "Chiller" in call.kwargs["title"]

    async def test_faulty_to_healthy_dispatches_info(self):
        dm = _make_dm()
        notifications = _make_notifications()
        um = _make_um([_make_user("u1")])
        listener = FaultNotificationListener(dm, um, notifications)
        listener.register()

        faulty = _make_fault_attr(current_value=True, healthy_values=[False])
        healthy = _make_fault_attr(current_value=False, healthy_values=[False])
        await _fire(dm, _make_device(), "alarm", faulty, healthy)

        notifications.dispatch.assert_called_once()
        call = notifications.dispatch.call_args
        assert call.kwargs["severity"] == Severity.INFO
        assert "resolved" in call.kwargs["title"].lower()

    async def test_faulty_to_faulty_no_dispatch(self):
        """Value changes but attribute remains faulty — no duplicate alert."""
        dm = _make_dm()
        notifications = _make_notifications()
        listener = FaultNotificationListener(dm, _make_um(), notifications)
        listener.register()

        faulty_v1 = _make_fault_attr(
            current_value=1,
            healthy_values=[0],
            data_type=DataType.INT,
            name="error_code",
        )
        faulty_v2 = _make_fault_attr(
            current_value=2,
            healthy_values=[0],
            data_type=DataType.INT,
            name="error_code",
        )
        await _fire(dm, _make_device(), "error_code", faulty_v1, faulty_v2)

        notifications.dispatch.assert_not_called()

    async def test_healthy_to_healthy_no_dispatch(self):
        """No transition — healthy stays healthy, no notification."""
        dm = _make_dm()
        notifications = _make_notifications()
        listener = FaultNotificationListener(dm, _make_um(), notifications)
        listener.register()

        healthy = _make_fault_attr(current_value=False, healthy_values=[False])
        await _fire(dm, _make_device(), "alarm", healthy, healthy)

        notifications.dispatch.assert_not_called()

    async def test_title_includes_attribute_name(self):
        dm = _make_dm()
        notifications = _make_notifications()
        um = _make_um([_make_user("u1")])
        listener = FaultNotificationListener(dm, um, notifications)
        listener.register()

        faulty = _make_fault_attr(current_value=True, healthy_values=[False])
        await _fire(dm, _make_device(), "high_pressure_alarm", None, faulty)

        call = notifications.dispatch.call_args
        assert "high_pressure_alarm" in call.kwargs["title"]

    async def test_blocked_users_excluded_from_dispatch(self):
        dm = _make_dm()
        notifications = _make_notifications()
        um = _make_um(
            [_make_user("u1"), _make_user("u2", is_blocked=True), _make_user("u3")]
        )
        listener = FaultNotificationListener(dm, um, notifications)
        listener.register()

        faulty = _make_fault_attr(current_value=True, healthy_values=[False])
        await _fire(dm, _make_device(), "alarm", None, faulty)

        call = notifications.dispatch.call_args
        assert call.kwargs["user_ids"] == ["u1", "u3"]

    async def test_two_fault_attributes_dispatch_independently(self):
        """Two distinct fault attributes on the same device each trigger their own alert."""
        dm = _make_dm()
        notifications = _make_notifications()
        um = _make_um([_make_user("u1")])
        listener = FaultNotificationListener(dm, um, notifications)
        listener.register()

        device = _make_device()
        faulty_1 = _make_fault_attr(
            current_value=True, healthy_values=[False], name="alarm_1"
        )
        faulty_2 = _make_fault_attr(
            current_value=True, healthy_values=[False], name="alarm_2"
        )

        await _fire(dm, device, "alarm_1", None, faulty_1)
        await _fire(dm, device, "alarm_2", None, faulty_2)

        assert notifications.dispatch.call_count == 2
