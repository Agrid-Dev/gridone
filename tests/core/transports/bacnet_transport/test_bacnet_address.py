import pytest

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
    object_type=BacnetObjectType.ANALOG_INPUT,
    object_instance=5,
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
    ],
)
def test_bacnet_address_from_str(raw: str, expected: BacnetAddress) -> None:
    assert BacnetAddress.from_str(raw) == expected
