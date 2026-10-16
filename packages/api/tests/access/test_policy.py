"""The ADR 0004 §2 truth table: intersection inside a scope, union across."""

import pytest

from api.access import UNRESTRICTED, AccessPolicy
from devices_manager import Attribute
from devices_manager.dto.device_dto import Device
from models.types import DataType
from models.write_rules import AttributeWriteState
from users.permissions import Permission
from users.roles import DeviceScope, DeviceSelector, Role


def _scope(
    types: list[str] | None = None,
    driver_ids: list[str] | None = None,
    attributes: list[str] | None = None,
) -> DeviceScope:
    return DeviceScope(
        devices=DeviceSelector(types=types, driver_ids=driver_ids),
        attributes=attributes,
    )


def _role(scopes: list[DeviceScope] | None) -> Role:
    return Role(
        id="r",
        name="r",
        permissions=[Permission.DEVICES_READ],
        scopes={} if scopes is None else {Permission.DEVICES_READ: scopes},
    )


THERMOSTAT = {"type": "thermostat", "driver_id": "vendor_mqtt"}
UNTYPED = {"type": None, "driver_id": "webhook_room"}


@pytest.mark.parametrize(
    ("scopes", "subject", "attribute", "readable"),
    [
        pytest.param(None, THERMOSTAT, "lockout", True, id="unscoped-reads-all"),
        pytest.param(
            [_scope()], UNTYPED, "humidity", True, id="empty-scope-matches-all"
        ),
        pytest.param([_scope(types=["thermostat"])], THERMOSTAT, "x", True, id="type"),
        pytest.param(
            [_scope(types=["thermostat"])],
            UNTYPED,
            "x",
            False,
            id="type-misses-untyped",
        ),
        pytest.param(
            [_scope(driver_ids=["webhook_room"])],
            UNTYPED,
            "x",
            True,
            id="driver-reaches-untyped",
        ),
        pytest.param(
            [_scope(attributes=["temperature"])],
            UNTYPED,
            "temperature",
            True,
            id="attribute-any-device",
        ),
        pytest.param(
            [_scope(attributes=["temperature"])],
            UNTYPED,
            "humidity",
            False,
            id="attribute-not-listed",
        ),
        pytest.param(
            [_scope(types=["thermostat"], driver_ids=["other"])],
            THERMOSTAT,
            "x",
            False,
            id="fields-intersect",
        ),
        pytest.param(
            [_scope(types=["thermostat"], attributes=["temperature"])],
            THERMOSTAT,
            "mode",
            False,
            id="type-ok-attribute-not",
        ),
        pytest.param(
            [_scope(types=["thermostat"]), _scope(driver_ids=["webhook_room"])],
            UNTYPED,
            "x",
            True,
            id="scopes-union",
        ),
        pytest.param(
            [_scope(types=["chiller"])], THERMOSTAT, "x", False, id="no-match-hidden"
        ),
    ],
)
def test_can_read(scopes, subject, attribute, readable):
    policy = AccessPolicy.from_role(_role(scopes))

    assert policy.can_read(**subject, attribute=attribute) is readable


def test_a_missing_role_or_an_unscoped_one_is_unrestricted():
    assert AccessPolicy.from_role(None) is UNRESTRICTED
    assert AccessPolicy.from_role(_role(None)) is UNRESTRICTED
    assert AccessPolicy.from_role(_role([_scope()])).is_unrestricted is False


def _device(**attributes: Attribute) -> Device:
    return Device(
        id="t1",
        name="Thermostat",
        type="thermostat",
        attributes=attributes,
        config={},
        driver_id="vendor_mqtt",
        transport_id="mqtt",
    )


TEMPERATURE = Attribute.create("temperature", DataType.FLOAT, {"read"})
MODE = Attribute.create("mode", DataType.STRING, {"read", "write"})


class TestProjectDevice:
    def test_keeps_only_the_readable_attributes(self):
        policy = AccessPolicy.from_role(
            _role([_scope(types=["thermostat"], attributes=["temperature"])])
        )
        device = _device(temperature=TEMPERATURE, mode=MODE)

        projected = policy.project_device(device)

        assert projected is not None
        assert list(projected.attributes) == ["temperature"]
        assert projected.model_dump(exclude={"attributes"}) == device.model_dump(
            exclude={"attributes"}
        )

    def test_a_device_with_nothing_readable_is_none(self):
        policy = AccessPolicy.from_role(_role([_scope(types=["chiller"])]))

        assert policy.project_device(_device(temperature=TEMPERATURE)) is None

    def test_unrestricted_returns_the_device_itself(self):
        device = _device(temperature=TEMPERATURE)

        assert UNRESTRICTED.project_device(device) is device


def test_missing_dependencies_do_not_disclose_restricted_attribute_names():
    from models.write_rules import AttributeWriteState

    state = AttributeWriteState(
        status="unknown",
        missing_dependencies=True,
        missing_attributes=["temperature", "private_lock"],
    )
    device = _device(
        temperature=TEMPERATURE, mode=MODE.model_copy(update={"write_state": state})
    )
    policy = AccessPolicy.from_role(_role([_scope(attributes=["temperature", "mode"])]))
    projected = policy.project_device(device)
    assert projected is not None
    projected_state = projected.attributes["mode"].write_state
    assert projected_state is not None
    assert projected_state.missing_attributes == ["temperature"]
    original_state = device.attributes["mode"].write_state
    assert original_state is not None
    assert original_state.missing_attributes == [
        "temperature",
        "private_lock",
    ]


def _commander(
    command: list[DeviceScope] | None,
    read: list[DeviceScope] | None = None,
    *,
    holds_read: bool = True,
) -> Role:
    scopes = {Permission.DEVICES_COMMAND: command} if command is not None else {}
    if read is not None:
        scopes[Permission.DEVICES_READ] = read
    permissions = [Permission.DEVICES_COMMAND]
    if holds_read:
        permissions.append(Permission.DEVICES_READ)
    return Role(id="c", name="c", permissions=permissions, scopes=scopes)


SETPOINT = [_scope(types=["thermostat"], attributes=["temperature_setpoint"])]


@pytest.mark.parametrize(
    ("role", "attribute", "readable", "commandable"),
    [
        pytest.param(_commander(None), "onoff_state", True, True, id="unscoped"),
        pytest.param(
            _commander(SETPOINT), "temperature_setpoint", True, True, id="granted"
        ),
        pytest.param(
            _commander(SETPOINT), "onoff_state", True, False, id="read-not-command"
        ),
        # Commanding implies reading: the read scope does not list the setpoint.
        pytest.param(
            _commander(SETPOINT, [_scope(attributes=["temperature"])]),
            "temperature_setpoint",
            True,
            True,
            id="read-union",
        ),
        pytest.param(
            _commander(SETPOINT, [_scope(attributes=["temperature"])]),
            "onoff_state",
            False,
            False,
            id="neither",
        ),
        pytest.param(
            _commander(SETPOINT, holds_read=False),
            "temperature_setpoint",
            True,
            True,
            id="no-devices-read-reads-the-commanded",
        ),
        pytest.param(
            _commander(SETPOINT, holds_read=False),
            "temperature",
            False,
            False,
            id="no-devices-read-reads-nothing-else",
        ),
        pytest.param(
            _commander(None, holds_read=False),
            "lockout",
            True,
            True,
            id="no-devices-read-unscoped-command-reads-all",
        ),
        # A hidden attribute cannot be commanded, whatever devices:command says.
        pytest.param(
            _commander(None, [_scope(attributes=["temperature"])]),
            "onoff_state",
            False,
            False,
            id="hidden-not-commandable",
        ),
    ],
)
def test_can_command(role, attribute, readable, commandable):
    policy = AccessPolicy.from_role(role)

    assert policy.can_read(**THERMOSTAT, attribute=attribute) is readable
    assert policy.can_command(**THERMOSTAT, attribute=attribute) is commandable


def test_a_scoped_command_alone_restricts_the_policy():
    policy = AccessPolicy.from_role(_commander(SETPOINT))

    assert policy.is_unrestricted is False
    assert policy.reads_everything is True


def test_a_role_holding_neither_device_permission_stays_unrestricted():
    role = Role(id="t", name="t", permissions=[Permission.TIMESERIES_READ])

    assert AccessPolicy.from_role(role) is UNRESTRICTED


SETPOINT_ATTRIBUTE = Attribute.create(
    "temperature_setpoint", DataType.FLOAT, {"read", "write"}
)
ONOFF = Attribute.create("onoff_state", DataType.BOOL, {"read", "write"})


class TestProjectCommands:
    def _project(self, role: Role) -> Device:
        ready = AttributeWriteState(status="ready")
        device = _device(
            temperature=TEMPERATURE,
            temperature_setpoint=SETPOINT_ATTRIBUTE.model_copy(
                update={"write_state": ready}
            ),
            onoff_state=ONOFF.model_copy(update={"write_state": ready}),
        )
        projected = AccessPolicy.from_role(role).project_device(device)
        assert projected is not None
        return projected

    def test_a_readable_attribute_it_may_not_command_is_read_only(self):
        projected = self._project(_commander(SETPOINT))

        # "loses write in read_write_modes", like a driver without a write.
        assert projected.attributes["onoff_state"].read_write_modes == {"read"}
        assert projected.attributes["onoff_state"].write_state is None
        assert projected.attributes["temperature_setpoint"].read_write_modes == {
            "read",
            "write",
        }
        assert projected.attributes["temperature_setpoint"].write_state is not None
        assert set(projected.attributes) == {
            "temperature",
            "temperature_setpoint",
            "onoff_state",
        }

    def test_a_command_scope_never_makes_an_attribute_writable(self):
        projected = self._project(
            _commander([_scope(attributes=["temperature", "temperature_setpoint"])])
        )

        assert projected.attributes["temperature"].read_write_modes == {"read"}

    def test_without_devices_read_only_the_commanded_attributes_are_served(self):
        projected = self._project(_commander(SETPOINT, holds_read=False))

        assert list(projected.attributes) == ["temperature_setpoint"]

    def test_an_unscoped_command_keeps_every_write(self):
        projected = self._project(_commander(None, [_scope(types=["thermostat"])]))

        assert projected.attributes["onoff_state"].read_write_modes == {
            "read",
            "write",
        }
