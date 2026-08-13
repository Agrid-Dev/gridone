import pytest
from asyncua import ua
from conftest import OpcuaServerHandle, string_address

from devices_manager.core.transports.opcua_transport.client import OpcuaTransportClient

pytestmark = [pytest.mark.asyncio, pytest.mark.integration]


async def test_write_coerces_to_server_declared_int16(
    opcua_client: OpcuaTransportClient, opcua_server: OpcuaServerHandle
) -> None:
    idx, nodes = opcua_server.idx, opcua_server.nodes
    address = string_address(idx, "Int16")
    await opcua_client.write(address, 1234)
    assert await nodes["Int16"].read_data_type_as_variant_type() == ua.VariantType.Int16
    assert await opcua_client._read(address) == 1234  # noqa: SLF001


async def test_write_out_of_range_for_declared_type_raises_typed_error(
    opcua_client: OpcuaTransportClient, opcua_server: OpcuaServerHandle
) -> None:
    idx = opcua_server.idx
    address = string_address(idx, "Int16")
    with pytest.raises(ua.UaStatusCodeError):
        await opcua_client.write(address, 100_000)


async def test_write_to_read_only_node_raises_typed_error(
    opcua_client: OpcuaTransportClient, opcua_server: OpcuaServerHandle
) -> None:
    idx = opcua_server.idx
    address = string_address(idx, "ReadOnly")
    with pytest.raises(ua.UaStatusCodeError):
        await opcua_client.write(address, 99)


async def test_write_non_numeric_string_to_numeric_node_raises_typed_error(
    opcua_client: OpcuaTransportClient, opcua_server: OpcuaServerHandle
) -> None:
    idx = opcua_server.idx
    address = string_address(idx, "Int32")
    with pytest.raises(ua.UaStatusCodeError):
        await opcua_client.write(address, "not-a-number")
