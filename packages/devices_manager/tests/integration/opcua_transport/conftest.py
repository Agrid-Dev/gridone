import contextlib
import socket
from collections.abc import AsyncGenerator
from datetime import UTC, datetime
from typing import NamedTuple

import pytest_asyncio
from asyncua import Server, ua
from asyncua.common.node import Node

from devices_manager.core.transports.opcua_transport.client import OpcuaTransportClient
from devices_manager.core.transports.opcua_transport.opcua_address import OpcuaAddress
from devices_manager.core.transports.opcua_transport.transport_config import (
    OpcuaTransportConfig,
)
from devices_manager.core.transports.transport_metadata import TransportMetadata

NAMESPACE_URI = "http://gridone.test/opcua_transport"


class OpcuaServerHandle(NamedTuple):
    endpoint: str
    idx: int
    nodes: dict[str, Node]
    server: Server


DEFAULT_DATETIME = datetime(2024, 1, 1, tzinfo=UTC)

# (browse name, initial value, variant type, writable)
SCALAR_NODES: list[tuple[str, object, ua.VariantType, bool]] = [
    ("Boolean", True, ua.VariantType.Boolean, True),
    ("Int16", 42, ua.VariantType.Int16, True),
    ("Int32", 42, ua.VariantType.Int32, True),
    ("Int64", 42, ua.VariantType.Int64, True),
    ("Float", 3.5, ua.VariantType.Float, True),
    ("Double", 3.5, ua.VariantType.Double, True),
    ("String", "hello", ua.VariantType.String, True),
    ("DateTime", DEFAULT_DATETIME, ua.VariantType.DateTime, True),
    ("ReadOnly", 7, ua.VariantType.Int32, False),
]

ARRAY_NODE_NAME = "Int32Array"
ARRAY_NODE_VALUE = [1, 2, 3]

# Numeric NodeId, to exercise the "i=" form end to end.
NUMERIC_NODE_ID = 9001
NUMERIC_NODE_NAME = "NumericInt32"
NUMERIC_NODE_VALUE = 11

EXTENSION_OBJECT_NODE_NAME = "ExtensionObject"
EXTENSION_OBJECT_ARG_NAME = "TestArgument"

UNKNOWN_NODE_ID = "ns=1;s=DoesNotExist"


def free_port() -> int:
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
        s.bind(("127.0.0.1", 0))
        return s.getsockname()[1]


def string_address(idx: int, name: str) -> OpcuaAddress:
    return OpcuaAddress.from_str(f"ns={idx};s={name}")


def _node_id(identifier: str | int, idx: int) -> ua.NodeId:
    # asyncua's Int16/Int32/String are int/str subclasses; plain values work.
    return ua.NodeId(identifier, idx)  # ty: ignore[invalid-argument-type]


@pytest_asyncio.fixture
async def opcua_server() -> AsyncGenerator[OpcuaServerHandle]:
    """In-process asyncua server exposing the OpcuaTransportClient test matrix."""
    server = Server()
    await server.init()
    port = free_port()
    endpoint = f"opc.tcp://127.0.0.1:{port}/gridone/opcua_transport/"
    server.set_endpoint(endpoint)
    idx = await server.register_namespace(NAMESPACE_URI)
    test_object = await server.get_objects_node().add_object(idx, "AcceptanceTest")

    nodes: dict[str, Node] = {}
    for name, value, variant_type, writable in SCALAR_NODES:
        node = await test_object.add_variable(
            _node_id(name, idx), name, value, variant_type
        )
        if writable:
            await node.set_writable()
        nodes[name] = node

    array_node = await test_object.add_variable(
        _node_id(ARRAY_NODE_NAME, idx),
        ARRAY_NODE_NAME,
        ARRAY_NODE_VALUE,
        ua.VariantType.Int32,
    )
    await array_node.set_writable()
    nodes[ARRAY_NODE_NAME] = array_node

    numeric_node = await test_object.add_variable(
        _node_id(NUMERIC_NODE_ID, idx),
        NUMERIC_NODE_NAME,
        NUMERIC_NODE_VALUE,
        ua.VariantType.Int32,
    )
    await numeric_node.set_writable()
    nodes[NUMERIC_NODE_NAME] = numeric_node

    extension_object_node = await test_object.add_variable(
        _node_id(EXTENSION_OBJECT_NODE_NAME, idx),
        EXTENSION_OBJECT_NODE_NAME,
        ua.Argument(Name=EXTENSION_OBJECT_ARG_NAME, ValueRank=ua.Int32(-1)),
        ua.VariantType.ExtensionObject,
    )
    nodes[EXTENSION_OBJECT_NODE_NAME] = extension_object_node

    await server.start()
    try:
        yield OpcuaServerHandle(endpoint, idx, nodes, server)
    finally:
        # A test may have already stopped the server; double-stop is a no-op.
        with contextlib.suppress(Exception):
            await server.stop()


@pytest_asyncio.fixture
async def opcua_client(
    opcua_server: OpcuaServerHandle,
) -> AsyncGenerator[OpcuaTransportClient]:
    """Connected OpcuaTransportClient, built directly against a real server."""
    endpoint = opcua_server.endpoint
    client = OpcuaTransportClient(
        TransportMetadata(id="opcua-test-transport", name="opcua-test-transport"),
        OpcuaTransportConfig(endpoint_url=endpoint, request_timeout=2.0),
    )
    await client.connect()
    try:
        yield client
    finally:
        await client.close()
