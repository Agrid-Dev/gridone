import pytest
from pydantic import ValidationError

from devices_manager.core.transports.bacnet_transport.bacnet_address import (
    BacnetAddress,
    BacnetObjectType,
    bacnet_object_type_from_raw,
)


@pytest.mark.parametrize(
    ("raw", "expected"),
    [
        ("BV", BacnetObjectType.BINARY_VALUE),
        ("BI", BacnetObjectType.BINARY_INPUT),
        ("BO", BacnetObjectType.BINARY_OUTPUT),
        ("AI", BacnetObjectType.ANALOG_INPUT),
        ("AO", BacnetObjectType.ANALOG_OUTPUT),
        ("MV", BacnetObjectType.MULTISTATE_VALUE),
        ("MI", BacnetObjectType.MULTISTATE_INPUT),
        ("MO", BacnetObjectType.MULTISTATE_OUTPUT),
        ("binary-input", BacnetObjectType.BINARY_INPUT),
        ("analog-output", BacnetObjectType.ANALOG_OUTPUT),
        ("multi-state-value", BacnetObjectType.MULTISTATE_VALUE),
        ("multi_state_value", BacnetObjectType.MULTISTATE_VALUE),
        ("BV ", BacnetObjectType.BINARY_VALUE),
    ],
)
def test_bacnet_object_type_from_raw(raw: str, expected: BacnetObjectType) -> None:
    assert bacnet_object_type_from_raw(raw) == expected


def test_bacnet_object_type_from_raw_invalid() -> None:
    with pytest.raises(ValueError, match="Invalid bacnet object type"):
        bacnet_object_type_from_raw("XY")


def test_multistate_value_uses_canonical_bacpypes_name() -> None:
    # bacpypes3.ObjectIdentifier rejects "multistate-value"; the value must be
    # the canonical "multi-state-value".
    assert BacnetObjectType.MULTISTATE_VALUE.value == "multi-state-value"


EXTRA_CONTEXT = {"device_instance": 8851}

ANALOG_INPUT_5_ADDRESS = BacnetAddress(
    object_type=BacnetObjectType.ANALOG_INPUT,
    object_instance=5,
    device_instance=8851,
)


@pytest.mark.parametrize(
    ("raw", "expected"),
    [
        ("AI5", ANALOG_INPUT_5_ADDRESS),
        ("AI05", ANALOG_INPUT_5_ADDRESS),
        ("AI:5", ANALOG_INPUT_5_ADDRESS),
        ("analog-input:5", ANALOG_INPUT_5_ADDRESS),
        ("ANALOG_INPUT:5", ANALOG_INPUT_5_ADDRESS),
        (
            "AO5",
            BacnetAddress(
                object_type=BacnetObjectType.ANALOG_OUTPUT,
                object_instance=5,
                device_instance=8851,
            ),
        ),
        (
            "AI05 P8",
            BacnetAddress(
                object_type=BacnetObjectType.ANALOG_INPUT,
                object_instance=5,
                write_priority=8,
                device_instance=8851,
            ),
        ),
    ],
)
def test_bacnet_address_from_str(raw: str, expected: BacnetAddress) -> None:
    assert BacnetAddress.from_str(raw, EXTRA_CONTEXT) == expected


@pytest.mark.parametrize(
    ("address_dict", "expected"),
    [
        ({"object_type": "analog-input", "object_instance": 5}, ANALOG_INPUT_5_ADDRESS),
        ({"object_type": "AI", "object_instance": 5}, ANALOG_INPUT_5_ADDRESS),
        ({"object_type": "ANALOG_INPUT", "object_instance": 5}, ANALOG_INPUT_5_ADDRESS),
        (
            {"object_type": "ANALOG_INPUT", "object_instance": 5, "write_priority": 8},
            BacnetAddress(
                object_type=BacnetObjectType.ANALOG_INPUT,
                object_instance=5,
                write_priority=8,
                device_instance=8851,
            ),
        ),
    ],
)
def test_bacnet_address_from_dict(address_dict: dict, expected: BacnetAddress) -> None:
    assert BacnetAddress.from_dict(address_dict, EXTRA_CONTEXT) == expected


def test_bacnet_address_raises_if_no_device_instance() -> None:
    raw = {"object_type": "ANALOG_INPUT", "object_instance": 5}
    with pytest.raises(ValidationError):
        BacnetAddress.from_raw(raw)


def test_bacnet_address_from_str_requires_device_instance() -> None:
    with pytest.raises(ValueError, match="device_instance is required"):
        BacnetAddress.from_str("AI5", {})


def test_bacnet_address_from_str_invalid_format() -> None:
    with pytest.raises(ValueError, match="Invalid Bacnet address format"):
        BacnetAddress.from_str("not-an-address", EXTRA_CONTEXT)


def test_bacnet_address_from_raw_invalid_type() -> None:
    with pytest.raises(ValueError, match="Invalid raw address type"):
        BacnetAddress.from_raw(42, EXTRA_CONTEXT)  # type: ignore[arg-type]


base = {"object_type": "ANALOG_INPUT", "object_instance": 5}


@pytest.mark.parametrize(
    "address_dict",
    [
        {**base, "write_priority": 2},
        {**base, "write_priority": 18},
    ],
)
def test_bacnet_address_from_dict_invalid_priority(address_dict: dict) -> None:
    with pytest.raises(ValidationError):
        BacnetAddress.from_dict(address_dict, EXTRA_CONTEXT)


def test_bacnet_address_id() -> None:
    address = ANALOG_INPUT_5_ADDRESS.model_copy()
    assert isinstance(address.id, str)
    assert len(address.id) > 1
    assert address.id.startswith("bacnet")
    for value in address.model_dump().values():
        if value is not None:
            assert str(value) in address.id
