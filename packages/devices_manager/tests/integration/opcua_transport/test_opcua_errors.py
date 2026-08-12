from unittest.mock import patch

import pytest
from asyncua import ua
from conftest import OpcuaServerHandle, free_port, string_address

from devices_manager.core.transports.opcua_transport.client import OpcuaTransportClient
from devices_manager.core.transports.opcua_transport.opcua_address import OpcuaAddress
from devices_manager.core.transports.opcua_transport.transport_config import (
    OpcuaTransportConfig,
)
from devices_manager.core.transports.read_result import ReadError
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


async def test_session_loss_triggers_schedule_reconnect(
    opcua_client: OpcuaTransportClient,
) -> None:
    with patch.object(opcua_client, "schedule_reconnect") as spy:
        await opcua_client._on_connection_lost(ConnectionError("session lost"))  # noqa: SLF001
    spy.assert_called_once()
