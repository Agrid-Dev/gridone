"""The ADR 0004 §2 truth table: intersection inside a scope, union across."""

import pytest

from api.access import UNRESTRICTED, AccessPolicy
from devices_manager import Attribute
from devices_manager.dto.device_dto import Device
from models.types import DataType
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
