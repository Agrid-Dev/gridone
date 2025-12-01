import pytest
from pydantic import ValidationError

from core.transports.bacnet_transport.bacnet_address import (
    BacnetAddress,
    BacnetObjectType,
    bacnet_object_type_from_raw,
    initials,
)


@pytest.mark.parametrize(
    ("full", "expected"),
    [
        ("binary-value", "BV"),
        ("binary-input", "BI"),
        ("analog-value", "AV"),
        ("analog--value-", "AV"),
    ],
)
def test_initials(full: str, expected: str) -> None:
    assert initials(full) == expected


@pytest.mark.parametrize(
    ("raw", "expected"),
    [
        ("BV", BacnetObjectType.BINARY_VALUE),
        ("BI", BacnetObjectType.BINARY_INPUT),
        ("AI", BacnetObjectType.ANALOG_INPUT),
        ("MV", BacnetObjectType.MULTISTATE_VALUE),
        ("binary-input", BacnetObjectType.BINARY_INPUT),
        ("BV ", BacnetObjectType.BINARY_VALUE),
    ],
)
def test_bacnet_object_type_from_raw(raw: str, expected: BacnetObjectType) -> None:
    assert bacnet_object_type_from_raw(raw) == expected


ANALOG_INPUT_5_ADDRESS = BacnetAddress(
    object_type=BacnetObjectType.ANALOG_INPUT, object_instance=5, device_instance=8851
)


@pytest.mark.parametrize(
    ("raw", "expected"),
    [
        (
            "AI5",
            ANALOG_INPUT_5_ADDRESS,
        ),
        (
            "AI05",
            ANALOG_INPUT_5_ADDRESS,
        ),
        (
            "AI:5",
            ANALOG_INPUT_5_ADDRESS,
        ),
        (
            "analog-input:5",
            ANALOG_INPUT_5_ADDRESS,
        ),
        ("ANALOG_INPUT:5", ANALOG_INPUT_5_ADDRESS),
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
    assert BacnetAddress.from_str(raw, {"device_instance": 8851}) == expected


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
    assert BacnetAddress.from_dict(address_dict, {"device_instance": 8851}) == expected


def test_bacnet_address_raises_if_no_device_instance() -> None:
    raw = {"object_type": "ANALOG_INPUT", "object_instance": 5}
    with pytest.raises(ValidationError):
        BacnetAddress.from_raw(raw)


base = {"object_type": "ANALOG_INPUT", "object_instance": 5}


@pytest.mark.parametrize(
    ("address_dict"),
    [
        (
            {
                **base,
                "write_priority": 2,
            }
        ),
        (
            {
                **base,
                "write_priority": 18,
            }
        ),
    ],
)
def test_bacnet_address_from_dict_invalid_priority(address_dict: dict) -> None:
    with pytest.raises(ValidationError):
        BacnetAddress.from_dict(address_dict, {"device_instance": 8851})


def test_bacnet_address_id() -> None:
    address = ANALOG_INPUT_5_ADDRESS.model_copy()
    assert isinstance(address.id, str)
    assert len(address.id) > 1
    assert address.id.startswith("bacnet")
    for value in address.model_dump().values():
        if value is not None:
            assert str(value) in address.id
