import pytest
from conftest import OpcuaServerHandle

from devices_manager.core.codecs.registry.json_pointer_codec import json_pointer_codec
from devices_manager.core.transports.opcua_transport.client import OpcuaTransportClient
from devices_manager.core.transports.opcua_transport.opcua_address import OpcuaAddress

pytestmark = [pytest.mark.asyncio, pytest.mark.integration]


async def test_extension_object_decodes_to_dict(
    opcua_client: OpcuaTransportClient, opcua_server: OpcuaServerHandle
) -> None:
    idx = opcua_server.idx
    address = OpcuaAddress.from_str(f"ns={idx};s=ExtensionObject")
    result = await opcua_client._read(address)  # noqa: SLF001
    assert isinstance(result, dict)
    assert result["Name"] == "TestArgument"
    assert result["ValueRank"] == -1


async def test_extension_object_dict_consumable_by_json_pointer_codec(
    opcua_client: OpcuaTransportClient, opcua_server: OpcuaServerHandle
) -> None:
    idx = opcua_server.idx
    address = OpcuaAddress.from_str(f"ns={idx};s=ExtensionObject")
    raw_value = await opcua_client._read(address)  # noqa: SLF001
    codec = json_pointer_codec("/Name")
    # ExtensionObject reads are dicts at runtime, not AttributeValueType.
    assert codec.decode(raw_value) == "TestArgument"  # ty: ignore[invalid-argument-type]
