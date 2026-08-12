from unittest.mock import patch

import pytest
from conftest import OpcuaServerHandle

from devices_manager.core.transports.opcua_transport.client import OpcuaTransportClient
from devices_manager.core.transports.opcua_transport.opcua_address import OpcuaAddress
from devices_manager.core.transports.read_result import ReadError, ReadOk

pytestmark = [pytest.mark.asyncio, pytest.mark.integration]


async def test_read_many_batches_into_one_read_service_call(
    opcua_client: OpcuaTransportClient, opcua_server: OpcuaServerHandle
) -> None:
    idx = opcua_server.idx
    addresses = [
        OpcuaAddress.from_str(f"ns={idx};s=Boolean"),
        OpcuaAddress.from_str(f"ns={idx};s=Int32"),
        OpcuaAddress.from_str(f"ns={idx};s=Float"),
        OpcuaAddress.from_str(f"ns={idx};s=String"),
    ]
    client = opcua_client._require_client()  # noqa: SLF001
    with patch.object(client, "read_attributes", wraps=client.read_attributes) as spy:
        results = {r.address_id: r async for r in opcua_client.read_many(addresses)}
    spy.assert_called_once()

    boolean_result = results[addresses[0].id]
    int_result = results[addresses[1].id]
    float_result = results[addresses[2].id]
    string_result = results[addresses[3].id]
    assert isinstance(boolean_result, ReadOk)
    assert isinstance(int_result, ReadOk)
    assert isinstance(float_result, ReadOk)
    assert isinstance(string_result, ReadOk)
    assert boolean_result.value is True
    assert int_result.value == 42
    assert float_result.value == 3.5
    assert string_result.value == "hello"


async def test_read_many_dedupes_addresses(
    opcua_client: OpcuaTransportClient, opcua_server: OpcuaServerHandle
) -> None:
    idx = opcua_server.idx
    address = OpcuaAddress.from_str(f"ns={idx};s=Int32")
    client = opcua_client._require_client()  # noqa: SLF001
    with patch.object(client, "read_attributes", wraps=client.read_attributes) as spy:
        results = [r async for r in opcua_client.read_many([address, address])]
    spy.assert_called_once()
    assert len(results) == 1


async def test_read_many_reports_unknown_node_as_read_error(
    opcua_client: OpcuaTransportClient, opcua_server: OpcuaServerHandle
) -> None:
    idx = opcua_server.idx
    known = OpcuaAddress.from_str(f"ns={idx};s=Int32")
    unknown = OpcuaAddress.from_str(f"ns={idx};s=DoesNotExist")
    results = {r.address_id: r async for r in opcua_client.read_many([known, unknown])}
    known_result = results[known.id]
    unknown_result = results[unknown.id]
    assert isinstance(known_result, ReadOk)
    assert isinstance(unknown_result, ReadError)
    assert isinstance(unknown_result.error, Exception)
