import pytest
from devices_manager.core.transports.modbus_tcp_transport.modbus_address import (
    ModbusAddress,
    ModbusAddressType,
)

DEVICE_ID = 3
TEST_CASES: list[tuple[str, dict, ModbusAddress]] = [
    (
        "HR25",
        {"type": "HR", "instance": 25},
        ModbusAddress(
            type=ModbusAddressType.HOLDING_REGISTER, instance=25, device_id=DEVICE_ID
        ),
    ),
    (
        "DI:4",
        {"type": "DI", "instance": 4},
        ModbusAddress(
            type=ModbusAddressType.DISCRETE_INPUT, instance=4, device_id=DEVICE_ID
        ),
    ),
    (
        "C2 ",
        {"type": "C", "instance": 2},
        ModbusAddress(type=ModbusAddressType.COIL, instance=2, device_id=DEVICE_ID),
    ),
    (
        "C03 ",
        {"type": "C", "instance": 3},
        ModbusAddress(type=ModbusAddressType.COIL, instance=3, device_id=DEVICE_ID),
    ),
    (
        "IR 12 ",
        {"type": "IR", "instance": 12},
        ModbusAddress(
            type=ModbusAddressType.INPUT_REGISTER,
            instance=12,
            device_id=DEVICE_ID,
        ),
    ),
    # Multi-register HR/IR addresses with various separators.
    (
        "HR4:2",
        {"type": "HR", "instance": 4, "count": 2},
        ModbusAddress(
            type=ModbusAddressType.HOLDING_REGISTER,
            instance=4,
            device_id=DEVICE_ID,
            count=2,
        ),
    ),
    (
        "HR4x2",
        {"type": "HR", "instance": 4, "count": 2},
        ModbusAddress(
            type=ModbusAddressType.HOLDING_REGISTER,
            instance=4,
            device_id=DEVICE_ID,
            count=2,
        ),
    ),
    (
        "HR4-2",
        {"type": "HR", "instance": 4, "count": 2},
        ModbusAddress(
            type=ModbusAddressType.HOLDING_REGISTER,
            instance=4,
            device_id=DEVICE_ID,
            count=2,
        ),
    ),
    (
        "IR0:3",
        {"type": "IR", "instance": 0, "count": 3},
        ModbusAddress(
            type=ModbusAddressType.INPUT_REGISTER,
            instance=0,
            device_id=DEVICE_ID,
            count=3,
        ),
    ),
]


@pytest.mark.parametrize(
    ("raw_address", "_", "expected"),
    TEST_CASES,
)
def test_modbus_address_from_string(
    raw_address: str,
    _: dict,
    expected: ModbusAddress,
) -> None:
    assert ModbusAddress.from_str(raw_address, {"device_id": DEVICE_ID}) == expected


@pytest.mark.parametrize(
    ("_", "raw_address", "expected"),
    TEST_CASES,
)
def test_modbus_address_from_dict(
    _: str,
    raw_address: dict,
    expected: ModbusAddress,
) -> None:
    assert ModbusAddress.from_dict(raw_address, {"device_id": DEVICE_ID}) == expected


@pytest.mark.parametrize(
    ("address", "expected"),
    [
        (
            ModbusAddress(type=ModbusAddressType.COIL, instance=2, device_id=1),
            "modbus@device:1/C:2:1",
        ),
        (
            ModbusAddress(type=ModbusAddressType.COIL, instance=2, device_id=4),
            "modbus@device:4/C:2:1",
        ),
        (
            ModbusAddress(
                type=ModbusAddressType.HOLDING_REGISTER,
                instance=4,
                device_id=DEVICE_ID,
                count=2,
            ),
            "modbus@device:3/HR:4:2",
        ),
    ],
)
def test_modbus_address_id(address: ModbusAddress, expected: str) -> None:
    assert address.id == expected
