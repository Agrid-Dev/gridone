import pytest

from core.transports.modbus_tcp_transport.modbus_address import (
    ModbusAddress,
    ModbusAddressType,
)


@pytest.mark.parametrize(
    ("raw_address", "expected"),
    [
        (
            "HR25",
            ModbusAddress(
                type=ModbusAddressType.HOLDING_REGISTER,
                instance=25,
            ),
        ),
        (
            "DI:4",
            ModbusAddress(
                type=ModbusAddressType.DISCRETE_INPUT,
                instance=4,
            ),
        ),
        (
            "C2 ",
            ModbusAddress(
                type=ModbusAddressType.COIL,
                instance=2,
            ),
        ),
        (
            "C03 ",
            ModbusAddress(
                type=ModbusAddressType.COIL,
                instance=3,
            ),
        ),
        (
            "IR 12 ",
            ModbusAddress(
                type=ModbusAddressType.INPUT_REGISTER,
                instance=12,
            ),
        ),
    ],
)
def test_modbus_address_from_str(raw_address: str, expected: ModbusAddress) -> None:
    assert ModbusAddress.from_str(raw_address) == expected
