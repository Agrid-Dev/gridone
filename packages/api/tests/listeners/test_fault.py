from datetime import UTC, datetime
from unittest.mock import AsyncMock, MagicMock

import pytest

from api.listeners.fault import on_fault_transition
from devices_manager import Attribute, CoreDevice, DeviceBase, Driver, FaultAttribute
from devices_manager.core.codecs.factory import CodecSpec
from devices_manager.core.driver import (
    DriverMetadata,
    FaultAttributeDriver,
    UpdateStrategy,
)
from devices_manager.core.transports import TransportMetadata
from devices_manager.core.transports.http_transport import (
    HTTPTransportClient,
    HttpTransportConfig,
)
from devices_manager.types import AttributeValueType, DataType, TransportProtocols
from models.types import Severity
from notifications.interface import NotificationsServiceInterface

_NOW = datetime(2026, 1, 1, tzinfo=UTC)


def _make_notifications() -> AsyncMock:
    return AsyncMock(spec=NotificationsServiceInterface)


def _make_recipients(user_ids: list[str] | None = None) -> AsyncMock:
    return AsyncMock(return_value=user_ids or [])


def _make_device(device_id: str = "dev-1", name: str = "Chiller") -> MagicMock:
    device = MagicMock()
    device.id = device_id
    device.name = name
    return device


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
    current_value: AttributeValueType | None,
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


class TestFaultTransitionListener:
    pytestmark = pytest.mark.asyncio

    async def test_standard_attribute_ignored(self):
        notifications = _make_notifications()
        listener = on_fault_transition(notifications, _make_recipients())

        await listener(
            _make_device(), "temperature", None, _make_standard_attr(), initial=False
        )

        notifications.dispatch.assert_not_called()

    async def test_none_previous_to_faulty_dispatches_alert(self):
        notifications = _make_notifications()
        listener = on_fault_transition(notifications, _make_recipients(["u1"]))

        faulty = _make_fault_attr(current_value=True, healthy_values=[False])
        await listener(_make_device(), "alarm", None, faulty, initial=False)

        notifications.dispatch.assert_called_once()
        call = notifications.dispatch.call_args
        assert call.kwargs["severity"] == Severity.WARNING
        assert "New fault" in call.kwargs["title"]

    async def test_none_previous_to_healthy_no_dispatch(self):
        notifications = _make_notifications()
        listener = on_fault_transition(notifications, _make_recipients())

        healthy = _make_fault_attr(current_value=False, healthy_values=[False])
        await listener(_make_device(), "alarm", None, healthy, initial=False)

        notifications.dispatch.assert_not_called()

    @pytest.mark.parametrize(
        "severity", [Severity.INFO, Severity.WARNING, Severity.ALERT]
    )
    async def test_healthy_to_faulty_dispatches_with_attribute_severity(
        self, severity: Severity
    ):
        notifications = _make_notifications()
        listener = on_fault_transition(notifications, _make_recipients(["u1"]))

        healthy = _make_fault_attr(
            current_value=False, healthy_values=[False], severity=severity
        )
        faulty = _make_fault_attr(
            current_value=True, healthy_values=[False], severity=severity
        )
        await listener(_make_device(), "alarm", healthy, faulty, initial=False)

        notifications.dispatch.assert_called_once()
        call = notifications.dispatch.call_args
        assert call.kwargs["severity"] == severity
        assert "New fault" in call.kwargs["title"]
        assert "Chiller" in call.kwargs["title"]

    async def test_faulty_to_healthy_dispatches_info(self):
        notifications = _make_notifications()
        listener = on_fault_transition(notifications, _make_recipients(["u1"]))

        faulty = _make_fault_attr(current_value=True, healthy_values=[False])
        healthy = _make_fault_attr(current_value=False, healthy_values=[False])
        await listener(_make_device(), "alarm", faulty, healthy, initial=False)

        notifications.dispatch.assert_called_once()
        call = notifications.dispatch.call_args
        assert call.kwargs["severity"] == Severity.INFO
        assert "resolved" in call.kwargs["title"].lower()

    async def test_faulty_to_faulty_no_dispatch(self):
        """Value changes but attribute remains faulty — no duplicate alert."""
        notifications = _make_notifications()
        listener = on_fault_transition(notifications, _make_recipients())

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
        await listener(
            _make_device(), "error_code", faulty_v1, faulty_v2, initial=False
        )

        notifications.dispatch.assert_not_called()

    async def test_healthy_to_healthy_no_dispatch(self):
        """No transition — healthy stays healthy, no notification."""
        notifications = _make_notifications()
        listener = on_fault_transition(notifications, _make_recipients())

        healthy = _make_fault_attr(current_value=False, healthy_values=[False])
        await listener(_make_device(), "alarm", healthy, healthy, initial=False)

        notifications.dispatch.assert_not_called()

    async def test_title_includes_attribute_name(self):
        notifications = _make_notifications()
        listener = on_fault_transition(notifications, _make_recipients(["u1"]))

        faulty = _make_fault_attr(current_value=True, healthy_values=[False])
        await listener(
            _make_device(), "high_pressure_alarm", None, faulty, initial=False
        )

        call = notifications.dispatch.call_args
        assert "high_pressure_alarm" in call.kwargs["title"]

    async def test_body_includes_attribute_value(self):
        notifications = _make_notifications()
        listener = on_fault_transition(notifications, _make_recipients(["u1"]))

        faulty = _make_fault_attr(current_value=True, healthy_values=[False])
        await listener(_make_device(), "alarm", None, faulty, initial=False)

        call = notifications.dispatch.call_args
        assert "True" in call.kwargs["body"]

    async def test_dispatch_uses_recipients_ids(self):
        notifications = _make_notifications()
        listener = on_fault_transition(notifications, _make_recipients(["u1", "u3"]))

        faulty = _make_fault_attr(current_value=True, healthy_values=[False])
        await listener(_make_device(), "alarm", None, faulty, initial=False)

        call = notifications.dispatch.call_args
        assert call.kwargs["user_ids"] == ["u1", "u3"]

    async def test_two_fault_attributes_dispatch_independently(self):
        """Two distinct fault attributes on the same device each trigger
        their own alert.
        """
        notifications = _make_notifications()
        listener = on_fault_transition(notifications, _make_recipients(["u1"]))

        device = _make_device()
        faulty_1 = _make_fault_attr(
            current_value=True, healthy_values=[False], name="alarm_1"
        )
        faulty_2 = _make_fault_attr(
            current_value=True, healthy_values=[False], name="alarm_2"
        )

        await listener(device, "alarm_1", None, faulty_1, initial=False)
        await listener(device, "alarm_2", None, faulty_2, initial=False)

        assert notifications.dispatch.call_count == 2


def _sensor_device() -> CoreDevice:
    """A fault attribute whose firmware reports 255 when it cannot tell."""
    alarm = FaultAttributeDriver(
        name="alarm",
        data_type=DataType.INT,
        read="GET /alarm",
        write=None,
        codecs=[CodecSpec(name="invalid_values", argument=[255])],
        healthy_values=[0],
        severity=Severity.WARNING,
    )
    driver = Driver(
        metadata=DriverMetadata(id="alarm_driver"),
        env={},
        transport=TransportProtocols.HTTP,
        device_config_required=[],
        update_strategy=UpdateStrategy(polling_enabled=False),
        attributes={"alarm": alarm},
    )
    transport = HTTPTransportClient(
        TransportMetadata(id="http-alarm", name="Alarm HTTP"), HttpTransportConfig()
    )
    return CoreDevice.from_base(
        DeviceBase(id="dev-1", name="Chiller", config={}),
        driver=driver,
        transport=transport,
    )


class TestUnknownFaultValues:
    pytestmark = pytest.mark.asyncio

    async def test_an_unknown_value_is_neither_a_fault_nor_a_resolution(self):
        notifications = _make_notifications()
        listener = on_fault_transition(notifications, _make_recipients())

        faulty = _make_fault_attr(current_value=True, healthy_values=[False])
        unknown = _make_fault_attr(current_value=None, healthy_values=[False])
        await listener(_make_device(), "alarm", faulty, unknown, initial=False)

        notifications.dispatch.assert_not_awaited()

    @pytest.mark.parametrize(
        ("recovered", "titles"),
        [
            (1, ["New fault on Chiller (alarm)"]),
            (0, ["New fault on Chiller (alarm)", "Fault resolved on Chiller (alarm)"]),
        ],
    )
    async def test_an_invalid_sample_between_two_readings(
        self, monkeypatch, recovered, titles
    ):
        """A sentinel between two faulty readings is not a resolution followed
        by a new fault; the recovery is compared with the last known state."""
        device = _sensor_device()
        events: list[tuple[Attribute | None, Attribute]] = []

        def record(_device, _name, previous, attribute, *, initial) -> None:  # noqa: ARG001
            events.append((previous, attribute.model_copy()))

        device.on_update = record
        monkeypatch.setattr(
            device.transport, "_read", AsyncMock(side_effect=[1, 255, recovered])
        )
        for _ in range(3):
            await device.read_attribute_value("alarm")

        notifications = _make_notifications()
        listener = on_fault_transition(notifications, _make_recipients())
        for previous, attribute in events:
            if attribute.name == "alarm":
                await listener(device, "alarm", previous, attribute, initial=False)
        assert [
            call.kwargs["title"] for call in notifications.dispatch.call_args_list
        ] == titles
