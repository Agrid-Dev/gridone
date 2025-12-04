from asyncio import Lock

import pytest
from core.transports.connected import connected


class MockTransportClient:
    """Minimal class implementing ConnectedProtocol for testing."""

    _is_connected: bool
    _connection_lock: Lock
    _connect_count: int  # counts how many times _connect has run

    def __init__(self) -> None:
        self._is_connected = False
        self._connection_lock = Lock()
        self._connect_count = 0

    async def connect(self) -> None:
        """Mock connect method."""
        self._connect_count += 1
        self._is_connected = True

    @connected
    async def read(self, address: str) -> str:
        if not self._is_connected:
            msg = "Trying to read while not connected !"
            raise ValueError(msg)
        return address


@pytest.mark.asyncio
async def test_connected_decorator_runs_before_connected_method() -> None:
    """Test that the decorator connects the client if not connected."""
    client = MockTransportClient()
    assert not client._is_connected
    address = "my-address"
    read_result = await client.read(address)
    assert read_result == address  # to check the function executed properly
    assert client._is_connected


@pytest.mark.asyncio
async def test_connected_decorator_runs_connect_only_once() -> None:
    client = MockTransportClient()
    assert not client._is_connected

    for address in ["a", "b", "c"]:
        read_result = await client.read(address)
        assert read_result == address  # to check the function executed properly

    assert client._is_connected
    assert client._connect_count == 1
