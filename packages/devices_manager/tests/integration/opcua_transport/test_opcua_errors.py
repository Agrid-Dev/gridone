import asyncio
from unittest.mock import patch

import pytest
from asyncua import Client, ua
from asyncua.common.node import Node
from conftest import OpcuaServerHandle, free_port, string_address

from devices_manager.core.transports.opcua_transport.client import OpcuaTransportClient
from devices_manager.core.transports.opcua_transport.opcua_address import OpcuaAddress
from devices_manager.core.transports.opcua_transport.transport_config import (
    OpcuaTransportConfig,
)
from devices_manager.core.transports.read_result import ReadError
from devices_manager.core.transports.transport_connection_state import ConnectionStatus
from devices_manager.core.transports.transport_metadata import TransportMetadata

pytestmark = [pytest.mark.asyncio, pytest.mark.integration]


async def test_read_unknown_node_id_raises_typed_error(
    opcua_client: OpcuaTransportClient, opcua_server: OpcuaServerHandle
) -> None:
    address = string_address(opcua_server.idx, "DoesNotExist")
    with pytest.raises(ua.uaerrors.BadNodeIdUnknown):
        await opcua_client.read(address)


async def test_read_while_disconnected_raises_typed_error() -> None:
    """No server listens on this port, so the lazy @connected reconnect fails."""
    port = free_port()
    client = OpcuaTransportClient(
        TransportMetadata(id="opcua-disconnected", name="opcua-disconnected"),
        OpcuaTransportConfig(
            endpoint_url=f"opc.tcp://127.0.0.1:{port}/nowhere/",
            connect_timeout=0.5,
            request_timeout=0.5,
        ),
    )
    address = OpcuaAddress.from_str("ns=1;s=Anything")
    with pytest.raises(ConnectionError):
        await client.read(address)


async def test_server_down_mid_read_fails_cleanly(
    opcua_client: OpcuaTransportClient, opcua_server: OpcuaServerHandle
) -> None:
    address = string_address(opcua_server.idx, "Int32")
    # Sanity: the connection works before the server goes away.
    assert await opcua_client.read(address) == 42

    await opcua_server.server.stop()

    with pytest.raises(Exception):  # noqa: B017, PT011
        await opcua_client.read(address)


async def test_read_many_isolates_batch_failure_as_read_error_per_address(
    opcua_client: OpcuaTransportClient, opcua_server: OpcuaServerHandle
) -> None:
    """A failed batch must not raise out of the read_many generator."""
    addresses = [
        string_address(opcua_server.idx, "Int32"),
        string_address(opcua_server.idx, "Boolean"),
    ]
    await opcua_server.server.stop()

    results = [r async for r in opcua_client.read_many(addresses)]

    assert len(results) == len(addresses)
    assert all(isinstance(r, ReadError) for r in results)
    assert not opcua_client.connection_state.is_connected


async def test_read_many_parks_an_error_state_when_the_server_is_unreachable() -> None:
    """read_many bypasses @connected, which is what parks the state everywhere
    else — without that the transport reports idle while every sweep fails."""
    client = OpcuaTransportClient(
        TransportMetadata(id="opcua-unreachable", name="opcua-unreachable"),
        OpcuaTransportConfig(
            endpoint_url="opc.tcp://127.0.0.1:1/nowhere/", connect_timeout=1.0
        ),
    )
    address = OpcuaAddress.from_str("ns=1;s=Anything")
    assert client.connection_state.status == ConnectionStatus.IDLE

    results = [r async for r in client.read_many([address])]

    assert all(isinstance(r, ReadError) for r in results)
    assert client.connection_state.status == ConnectionStatus.ERROR
    assert client.connection_state.info


async def test_connect_timeout_disconnects_partially_connected_client() -> None:
    """A connect() that times out mid-handshake must still clean up the
    socket it opened, since self._client is only assigned on success."""
    client = OpcuaTransportClient(
        TransportMetadata(id="opcua-timeout", name="opcua-timeout"),
        OpcuaTransportConfig(
            endpoint_url="opc.tcp://127.0.0.1:1/nowhere/",
            connect_timeout=0.05,
            request_timeout=0.5,
        ),
    )

    async def hang_forever(*args, **kwargs) -> None:  # noqa: ARG001, ANN002, ANN003
        await asyncio.sleep(10)

    with (
        patch.object(Client, "connect", hang_forever),
        patch.object(Client, "disconnect", autospec=True) as disconnect_spy,
        pytest.raises(TimeoutError),
    ):
        await client.connect()
    disconnect_spy.assert_called_once()


async def test_session_loss_triggers_schedule_reconnect(
    opcua_client: OpcuaTransportClient,
) -> None:
    with patch.object(opcua_client, "schedule_reconnect") as spy:
        await opcua_client._on_connection_lost(ConnectionError("session lost"))  # noqa: SLF001
    spy.assert_called_once()


async def test_session_loss_surfaces_connection_error_state(
    opcua_client: OpcuaTransportClient,
) -> None:
    with patch.object(opcua_client, "schedule_reconnect"):
        await opcua_client._on_connection_lost(ConnectionError("session lost"))  # noqa: SLF001

    assert opcua_client.connection_state.status == ConnectionStatus.ERROR


async def test_in_flight_read_survives_concurrent_connection_loss(
    opcua_client: OpcuaTransportClient, opcua_server: OpcuaServerHandle
) -> None:
    """_read_lock is a nullcontext (_serialize_reads=False), so nothing
    serializes an in-flight read against a session-loss-triggered
    close/reconnect. It must resolve cleanly either way, not hang."""
    address = string_address(opcua_server.idx, "Int32")
    original_read_data_value = Node.read_data_value

    async def delayed_read(self: Node, *args, **kwargs) -> ua.DataValue:  # noqa: ANN002, ANN003
        await asyncio.sleep(0.2)
        return await original_read_data_value(self, *args, **kwargs)

    with patch.object(Node, "read_data_value", delayed_read):
        read_task = asyncio.create_task(opcua_client.read(address))
        await asyncio.sleep(0.05)
        await opcua_client._on_connection_lost(ConnectionError("session lost"))  # noqa: SLF001

        try:
            result = await asyncio.wait_for(read_task, timeout=5)
        except TimeoutError:
            pytest.fail("in-flight read hung instead of resolving")
        except Exception:  # noqa: BLE001, S110 — a clean failure is an acceptable outcome
            pass
        else:
            assert result == 42
