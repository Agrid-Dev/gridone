import asyncio
from types import SimpleNamespace

import pytest
from devices_manager.core.transports.modbus_tcp_transport import (
    ModbusTCPTransportClient,
    ModbusTCPTransportConfig,
)
from devices_manager.core.transports.modbus_tcp_transport.modbus_address import (
    ModbusAddress,
    ModbusAddressType,
)
from devices_manager.core.transports.transport_connection_state import (
    TransportConnectionState,
)
from devices_manager.core.transports.transport_metadata import TransportMetadata


class DummyModbusClient:
    def __init__(self) -> None:
        self.connected = True
        self.last_call = None

    async def read_holding_registers(
        self, address: int, count: int, device_id: int
    ) -> SimpleNamespace:
        self.last_call = ("read_holding_registers", address, count, device_id)
        return SimpleNamespace(registers=list(range(count)))

    async def read_input_registers(
        self, address: int, count: int, device_id: int
    ) -> SimpleNamespace:
        self.last_call = ("read_input_registers", address, count, device_id)
        return SimpleNamespace(registers=list(range(count)))

    async def write_register(self, address: int, value: int, device_id: int) -> None:
        """Single register write."""
        self.last_call = ("write_register", address, value, device_id)

    async def write_registers(
        self, address: int, values: list[int], device_id: int
    ) -> None:
        self.last_call = ("write_registers", address, values, device_id)


@pytest.fixture
def transport() -> ModbusTCPTransportClient:
    metadata = TransportMetadata(id="test", name="test")
    config = ModbusTCPTransportConfig(host="localhost", port=502)
    t = ModbusTCPTransportClient(metadata, config)
    # Bypass real connection logic.
    t._client = DummyModbusClient()  # type: ignore[attr-defined]
    t.connection_state = TransportConnectionState.connected()
    # Ensure connection lock exists for @connected decorator.
    if not hasattr(t, "_connection_lock"):
        t._connection_lock = asyncio.Lock()  # type: ignore[attr-defined]
    return t


@pytest.mark.asyncio
async def test_read_holding_register_single(
    transport: ModbusTCPTransportClient,
) -> None:
    address = ModbusAddress(
        type=ModbusAddressType.HOLDING_REGISTER,
        instance=10,
        device_id=1,
        count=1,
    )
    value = await transport.read(address)
    assert value == 0  # first register


@pytest.mark.asyncio
async def test_read_holding_register_multi(transport: ModbusTCPTransportClient) -> None:
    address = ModbusAddress(
        type=ModbusAddressType.HOLDING_REGISTER,
        instance=10,
        device_id=1,
        count=3,
    )
    value = await transport.read(address)
    assert value == [0, 1, 2]
    assert transport._client.last_call == (  # type: ignore[attr-defined]
        "read_holding_registers",
        10,
        3,
        1,
    )


@pytest.mark.asyncio
async def test_read_input_register_multi(transport: ModbusTCPTransportClient) -> None:
    address = ModbusAddress(
        type=ModbusAddressType.INPUT_REGISTER,
        instance=5,
        device_id=2,
        count=2,
    )
    value = await transport.read(address)
    assert value == [0, 1]
    assert transport._client.last_call == (  # type: ignore[attr-defined]
        "read_input_registers",
        5,
        2,
        2,
    )


@pytest.mark.asyncio
async def test_write_holding_register_single(
    transport: ModbusTCPTransportClient,
) -> None:
    address = ModbusAddress(
        type=ModbusAddressType.HOLDING_REGISTER,
        instance=7,
        device_id=3,
        count=1,
    )
    await transport.write(address, 42)
    assert transport._client.last_call == (  # type: ignore[attr-defined]
        "write_register",
        7,
        42,
        3,
    )


@pytest.mark.asyncio
async def test_write_holding_register_multi(
    transport: ModbusTCPTransportClient,
) -> None:
    address = ModbusAddress(
        type=ModbusAddressType.HOLDING_REGISTER,
        instance=7,
        device_id=3,
        count=2,
    )
    await transport.write(address, [1, 2])
    assert transport._client.last_call == (  # type: ignore[attr-defined]
        "write_registers",
        7,
        [1, 2],
        3,
    )


@pytest.mark.asyncio
async def test_write_holding_register_multi_mismatched_length(
    transport: ModbusTCPTransportClient,
) -> None:
    address = ModbusAddress(
        type=ModbusAddressType.HOLDING_REGISTER,
        instance=7,
        device_id=3,
        count=2,
    )
    with pytest.raises(ValueError, match="Length of provided values"):
        await transport.write(address, [1])
