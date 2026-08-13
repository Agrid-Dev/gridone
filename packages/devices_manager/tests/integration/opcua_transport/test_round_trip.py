from datetime import UTC, datetime

import pytest
from conftest import OpcuaServerHandle, string_address

from devices_manager.core.transports.opcua_transport.client import OpcuaTransportClient
from devices_manager.core.transports.opcua_transport.opcua_address import OpcuaAddress
from devices_manager.types import AttributeValueType

pytestmark = [pytest.mark.asyncio, pytest.mark.integration]


@pytest.mark.parametrize(
    ("node_name", "value"),
    [
        ("Boolean", True),
        ("Int32", 42),
        ("Int64", 42),
        ("Float", 3.5),
        ("Double", 3.5),
        ("String", "hello"),
    ],
)
async def test_read_scalar(
    opcua_client: OpcuaTransportClient,
    opcua_server: OpcuaServerHandle,
    node_name: str,
    value: AttributeValueType,
) -> None:
    idx = opcua_server.idx
    result = await opcua_client._read(string_address(idx, node_name))  # noqa: SLF001
    assert result == value


async def test_read_datetime(
    opcua_client: OpcuaTransportClient, opcua_server: OpcuaServerHandle
) -> None:
    idx = opcua_server.idx
    result = await opcua_client._read(string_address(idx, "DateTime"))  # noqa: SLF001
    assert result == datetime(2024, 1, 1, tzinfo=UTC)


async def test_read_array(
    opcua_client: OpcuaTransportClient, opcua_server: OpcuaServerHandle
) -> None:
    idx = opcua_server.idx
    result = await opcua_client._read(string_address(idx, "Int32Array"))  # noqa: SLF001
    assert result == [1, 2, 3]


async def test_read_via_numeric_node_id(
    opcua_client: OpcuaTransportClient, opcua_server: OpcuaServerHandle
) -> None:
    idx = opcua_server.idx
    address = OpcuaAddress.from_str(f"ns={idx};i=9001")
    result = await opcua_client._read(address)  # noqa: SLF001
    assert result == 11


@pytest.mark.parametrize(
    ("node_name", "value"),
    [
        ("Boolean", False),
        ("Int32", 99),
        ("Float", 1.25),
        ("String", "written"),
    ],
)
async def test_write_then_read_scalar(
    opcua_client: OpcuaTransportClient,
    opcua_server: OpcuaServerHandle,
    node_name: str,
    value: AttributeValueType,
) -> None:
    idx = opcua_server.idx
    address = string_address(idx, node_name)
    await opcua_client.write(address, value)
    assert await opcua_client._read(address) == value  # noqa: SLF001


async def test_write_via_numeric_node_id(
    opcua_client: OpcuaTransportClient, opcua_server: OpcuaServerHandle
) -> None:
    idx = opcua_server.idx
    address = OpcuaAddress.from_str(f"ns={idx};i=9001")
    await opcua_client.write(address, 77)
    assert await opcua_client._read(address) == 77  # noqa: SLF001
