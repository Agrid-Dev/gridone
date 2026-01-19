import asyncio

import pytest
from core.transports.connected import connected
from core.transports.transport_connection_state import (
    ConnectionStatus,
    TransportConnectionState,
)


class MockTransportClient:
    """Minimal class implementing ConnectedProtocol for testing."""

    id = "mock-id"
    connection_state: TransportConnectionState
    _connection_lock: asyncio.Lock
    _connect_count: int  # counts how many times _connect has run
    _fail_connect: bool  # whether the client should fail when connecting (for testing)

    def __init__(self, *, fail_connect: bool = False) -> None:
        self.connection_state = TransportConnectionState.idle()
        self._connection_lock = asyncio.Lock()
        self._connect_count = 0
        self._fail_connect = fail_connect

    async def connect(self):
        """All transport clients using @connected should connect within a Lock
        to avoid parallel connections."""
        async with self._connection_lock:
            if self.connection_state.is_connected:
                return

            self._connect_count += 1
            await asyncio.sleep(0.05)  # simulate slow connection
            if self._fail_connect:
                raise ValueError("I was asked to fail")  # noqa: TRY003
            self.connection_state = TransportConnectionState.connected()

    @connected
    async def read(self, address: str) -> str:
        if not self.connection_state.is_connected:
            msg = "Trying to read while not connected !"
            raise ValueError(msg)
        return address


@pytest.mark.asyncio
async def test_connected_decorator_runs_before_connected_method() -> None:
    """Test that the decorator connects the client if not connected."""
    client = MockTransportClient()
    assert not client.connection_state.is_connected
    address = "my-address"
    read_result = await client.read(address)
    assert read_result == address  # to check the function executed properly
    assert client.connection_state.is_connected


@pytest.mark.asyncio
async def test_connected_decorator_runs_connect_only_once() -> None:
    client = MockTransportClient()
    assert not client.connection_state.is_connected

    results = await asyncio.gather(
        client.read("a"),
        client.read("b"),
        client.read("c"),
    )

    assert results == ["a", "b", "c"]
    assert client.connection_state.is_connected
    assert client._connect_count == 1


@pytest.mark.asyncio
async def test_connection_status_on_connection_error():
    client = MockTransportClient(fail_connect=True)
    assert not client.connection_state.is_connected
    with pytest.raises(ValueError):  # noqa: PT011
        await client.read("a")
    assert client.connection_state.status == ConnectionStatus.CONNECTION_ERROR
