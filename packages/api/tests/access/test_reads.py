"""Scoped device reads over a mocked devices service."""

from datetime import UTC, datetime
from unittest.mock import MagicMock

import pytest

from api.access import UNRESTRICTED, AccessPolicy, ScopedDeviceReads
from devices_manager import Attribute, DevicesServiceInterface
from devices_manager.core.write_preview import DeviceWritePreview
from devices_manager.dto import FaultView
from devices_manager.dto.device_dto import AttributeSelection, Device
from models.errors import ForbiddenError, NotFoundError
from models.targets import DevicesFilter
from models.types import DataType, Severity
from models.write_rules import AttributeWriteState
from users.permissions import Permission
from users.roles import DeviceScope, DeviceSelector, Role

TEMPERATURE = Attribute.create("temperature", DataType.FLOAT, {"read"})
MODE = Attribute.create("mode", DataType.STRING, {"read", "write"})
HUMIDITY = Attribute.create("humidity", DataType.FLOAT, {"read"})

THERMOSTAT = Device(
    id="thermo",
    name="Thermostat",
    type="thermostat",
    attributes={"temperature": TEMPERATURE, "mode": MODE},
    config={},
    driver_id="vendor_mqtt",
    transport_id="mqtt",
)
ROOM = Device(
    id="room",
    name="Room",
    attributes={"humidity": HUMIDITY, "temperature": TEMPERATURE},
    config={},
    driver_id="webhook_room",
    transport_id="webhook",
)


def _fault(device: Device, attribute: str) -> FaultView:
    return FaultView(
        device_id=device.id,
        device_name=device.name,
        attribute_name=attribute,
        data_type=DataType.BOOL,
        severity=Severity.ALERT,
        current_value=True,
        last_updated=datetime(2026, 9, 22, tzinfo=UTC),
        last_changed=datetime(2026, 9, 22, tzinfo=UTC),
    )


def _policy(*scopes: DeviceScope) -> AccessPolicy:
    return AccessPolicy.from_role(
        Role(
            id="r",
            name="r",
            permissions=[Permission.DEVICES_READ],
            scopes={Permission.DEVICES_READ: list(scopes)},
        )
    )


THERMOSTATS_ONLY = _policy(DeviceScope(devices=DeviceSelector(types=["thermostat"])))
TEMPERATURES_ONLY = _policy(DeviceScope(attributes=["temperature"]))


@pytest.fixture
def dm() -> MagicMock:
    dm = MagicMock(spec=DevicesServiceInterface)
    devices = {d.id: d for d in (THERMOSTAT, ROOM)}
    dm.list_devices.side_effect = lambda **query: [
        d for d in devices.values() if query.get("ids") is None or d.id in query["ids"]
    ]

    def _get(device_id: str) -> Device:
        if device_id not in devices:
            msg = f"Device {device_id} not found"
            raise NotFoundError(msg)
        return devices[device_id]

    dm.get_device.side_effect = _get
    dm.list_active_faults.return_value = [
        _fault(THERMOSTAT, "mode"),
        _fault(ROOM, "humidity"),
    ]
    return dm


class TestListDevices:
    def test_hidden_devices_are_dropped_and_attributes_projected(self, dm):
        devices = ScopedDeviceReads(dm, TEMPERATURES_ONLY).list_devices()

        assert {d.id: list(d.attributes) for d in devices} == {
            "thermo": ["temperature"],
            "room": ["temperature"],
        }

    def test_a_device_with_nothing_readable_is_absent(self, dm):
        devices = ScopedDeviceReads(dm, THERMOSTATS_ONLY).list_devices()

        assert [d.id for d in devices] == ["thermo"]

    @pytest.mark.parametrize(
        "query",
        [
            pytest.param({"attribute": "mode"}, id="attribute"),
            pytest.param({"writable_attribute": "mode"}, id="writable-attribute"),
            pytest.param(
                {"writable_attribute_type": DataType.STRING}, id="writable-type"
            ),
        ],
    )
    def test_an_attribute_filter_is_rechecked_on_the_projection(self, dm, query):
        # The service matched the thermostat on ``mode``; the caller cannot
        # read ``mode``, so the match no longer holds.
        assert ScopedDeviceReads(dm, TEMPERATURES_ONLY).list_devices(**query) == []

    def test_unrestricted_passes_the_query_and_result_through(self, dm):
        devices = ScopedDeviceReads(dm, UNRESTRICTED).list_devices(ids=["room"])

        assert devices == [ROOM]
        dm.list_devices.assert_called_once_with(ids=["room"])

    def test_unrestricted_leaves_a_selection_to_the_service(self, dm):
        selection = AttributeSelection(names=frozenset({"mode"}))

        ScopedDeviceReads(dm, UNRESTRICTED).list_devices(attribute_selection=selection)

        dm.list_devices.assert_called_once_with(attribute_selection=selection)

    def test_scoped_reads_judge_whole_devices_then_trim(self, dm):
        devices = ScopedDeviceReads(dm, TEMPERATURES_ONLY).list_devices(
            attribute_selection=AttributeSelection(names=frozenset({"mode"}))
        )

        # The service lists whole devices: visibility needs every attribute.
        dm.list_devices.assert_called_once_with()
        # Both read a temperature, so both stay listed; `mode` is not theirs.
        assert {d.id: list(d.attributes) for d in devices} == {
            "thermo": [],
            "room": [],
        }


class TestGetDevice:
    def test_projected(self, dm):
        device = ScopedDeviceReads(dm, TEMPERATURES_ONLY).get_device("thermo")

        assert list(device.attributes) == ["temperature"]

    def test_hidden_is_not_found(self, dm):
        with pytest.raises(NotFoundError, match="room"):
            ScopedDeviceReads(dm, THERMOSTATS_ONLY).get_device("room")

    def test_unknown_stays_not_found(self, dm):
        with pytest.raises(NotFoundError):
            ScopedDeviceReads(dm, UNRESTRICTED).get_device("ghost")


class TestRequireAttribute:
    def test_readable_returns_the_projected_device(self, dm):
        device = ScopedDeviceReads(dm, TEMPERATURES_ONLY).require_attribute(
            "thermo", "temperature"
        )

        assert list(device.attributes) == ["temperature"]

    def test_hidden_attribute_is_not_found(self, dm):
        with pytest.raises(NotFoundError, match="mode"):
            ScopedDeviceReads(dm, TEMPERATURES_ONLY).require_attribute("thermo", "mode")

    def test_unrestricted_only_needs_the_device(self, dm):
        # An attribute the driver no longer declares keeps its history.
        device = ScopedDeviceReads(dm, UNRESTRICTED).require_attribute(
            "thermo", "retired"
        )

        assert device is THERMOSTAT


class TestListFaults:
    def test_faults_on_hidden_devices_or_attributes_are_dropped(self, dm):
        assert ScopedDeviceReads(dm, THERMOSTATS_ONLY).list_faults() == [
            _fault(THERMOSTAT, "mode")
        ]
        assert ScopedDeviceReads(dm, TEMPERATURES_ONLY).list_faults() == []

    def test_unrestricted_passes_the_filters_through(self, dm):
        faults = ScopedDeviceReads(dm, UNRESTRICTED).list_faults(
            severity=Severity.ALERT, device_id="room"
        )

        assert faults == dm.list_active_faults.return_value
        dm.list_active_faults.assert_called_once_with(
            severity=Severity.ALERT, device_id="room"
        )


# Reads every device; commands nothing but the thermostat's temperature.
TEMPERATURE_COMMANDER = AccessPolicy(
    None,
    [
        DeviceScope(
            devices=DeviceSelector(types=["thermostat"]), attributes=["temperature"]
        )
    ],
)


class TestRequireCommand:
    def test_a_granted_attribute_returns_the_device(self, dm):
        device = ScopedDeviceReads(dm, TEMPERATURE_COMMANDER).require_command(
            "thermo", "temperature"
        )

        assert device.id == "thermo"

    def test_a_readable_attribute_it_may_not_command_is_forbidden(self, dm):
        with pytest.raises(ForbiddenError, match="mode"):
            ScopedDeviceReads(dm, TEMPERATURE_COMMANDER).require_command(
                "thermo", "mode"
            )

    def test_a_hidden_attribute_stays_not_found(self, dm):
        with pytest.raises(NotFoundError, match="mode"):
            ScopedDeviceReads(dm, TEMPERATURES_ONLY).require_command("thermo", "mode")

    def test_a_hidden_device_stays_not_found(self, dm):
        with pytest.raises(NotFoundError, match="room"):
            ScopedDeviceReads(dm, THERMOSTATS_ONLY).require_command("room", "humidity")

    def test_an_unknown_attribute_is_left_to_the_write_path(self, dm):
        # Unrestricted or not, an attribute the device lacks keeps today's
        # answer: the resolver's "not exposed" (422), not a 403.
        for policy in (UNRESTRICTED, TEMPERATURE_COMMANDER):
            device = ScopedDeviceReads(dm, policy).require_command("thermo", "ghost")
            assert device.id == "thermo"


MODE_COMMANDER = AccessPolicy(None, [DeviceScope(attributes=["mode"])])


class TestRequireCommandable:
    def test_a_target_reaching_a_device_it_may_not_command_is_forbidden(self, dm):
        with pytest.raises(ForbiddenError, match="mode"):
            ScopedDeviceReads(dm, TEMPERATURE_COMMANDER).require_commandable(
                DevicesFilter(), "mode"
            )

    def test_a_target_it_may_command_everywhere_passes(self, dm):
        ScopedDeviceReads(dm, MODE_COMMANDER).require_commandable(
            DevicesFilter(), "mode"
        )

    def test_an_attribute_no_driver_writes_is_no_reach(self, dm):
        # A read-only attribute is never dispatched to: nothing to bound.
        ScopedDeviceReads(dm, TEMPERATURE_COMMANDER).require_commandable(
            DevicesFilter(), "humidity"
        )

    def test_unrestricted_is_not_checked(self, dm):
        ScopedDeviceReads(dm, UNRESTRICTED).require_commandable(DevicesFilter(), "mode")
        dm.list_devices.assert_not_called()


def test_a_writable_filter_is_rechecked_after_projection(dm):
    # The service matched ``mode`` as writable; this caller may not command it.
    reads = ScopedDeviceReads(dm, TEMPERATURE_COMMANDER)

    assert reads.list_devices(writable_attribute="mode") == []
    assert [
        d.id
        for d in ScopedDeviceReads(dm, MODE_COMMANDER).list_devices(
            writable_attribute="mode"
        )
    ] == ["thermo"]


class TestProjectPreview:
    PREVIEW = DeviceWritePreview(
        device_id="thermo",
        name="Thermostat",
        current_value=None,
        eligible=False,
        write_state=AttributeWriteState(
            status="unknown",
            missing_dependencies=True,
            missing_attributes=["temperature", "mode"],
        ),
    )

    def test_hides_the_names_the_caller_cannot_read(self, dm):
        projected = ScopedDeviceReads(dm, TEMPERATURES_ONLY).project_preview(
            self.PREVIEW
        )

        assert projected.write_state is not None
        assert projected.write_state.missing_attributes == ["temperature"]

    def test_a_caller_reading_everything_gets_it_as_is(self, dm):
        reads = ScopedDeviceReads(dm, TEMPERATURE_COMMANDER)

        assert reads.project_preview(self.PREVIEW) is self.PREVIEW
