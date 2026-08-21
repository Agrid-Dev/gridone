import asyncio
import contextlib
from collections.abc import Callable

import pytest
from asyncua import Server, ua
from asyncua.common.node import Node
from conftest import NAMESPACE_URI, OpcuaServerHandle, _node_id, string_address

from devices_manager.core.transports.opcua_transport.client import OpcuaTransportClient

pytestmark = [pytest.mark.asyncio, pytest.mark.integration]


async def _wait_until(predicate: Callable[[], bool], *, timeout_s: float = 5.0) -> None:
    """Poll a predicate with no dedicated Event to wait on instead —
    connection_state is a plain attribute, not an event source."""

    async def poll() -> None:
        while not predicate():  # noqa: ASYNC110
            await asyncio.sleep(0.02)

    await asyncio.wait_for(poll(), timeout=timeout_s)


async def _restart_server(
    current_server: Server, endpoint: str, idx: int
) -> tuple[Server, Node]:
    """Stop the current server and bring up a fresh one on the same endpoint
    with the same NodeIds — simulating a device reboot/network blip rather
    than a permanent topology change, which is what a resubscribe must
    survive."""
    await current_server.stop()
    server = Server()
    await server.init()
    server.set_endpoint(endpoint)
    new_idx = await server.register_namespace(NAMESPACE_URI)
    assert new_idx == idx, "namespace index drifted across restart"
    test_object = await server.get_objects_node().add_object(idx, "AcceptanceTest")
    node = await test_object.add_variable(
        _node_id("Int32", idx), "Int32", 42, ua.VariantType.Int32
    )
    await node.set_writable()
    await server.start()
    return server, node


async def _simulate_outage_and_recover(
    opcua_client: OpcuaTransportClient, current_server: Server, endpoint: str, idx: int
) -> tuple[Server, Node]:
    new_server, new_node = await _restart_server(current_server, endpoint, idx)
    await opcua_client._on_connection_lost(ConnectionError("session lost"))  # noqa: SLF001

    def _settled() -> bool:
        # Wait for any coalesced reconnect cycle to fully drain, not just
        # the first "connected" flip, so callers read a stable _monitored_items.
        task = opcua_client._reconnect_task  # noqa: SLF001
        return (
            opcua_client.connection_state.is_connected
            and not opcua_client._reconnect_pending  # noqa: SLF001
            and (task is None or task.done())
        )

    await _wait_until(_settled)
    return new_server, new_node


async def test_reconnect_resubscribes_without_re_registering_listeners(
    opcua_client: OpcuaTransportClient, opcua_server: OpcuaServerHandle
) -> None:
    """Kill/restart the server mid-subscription -> updates resume
    automatically, without the test re-registering the listener."""
    address = string_address(opcua_server.idx, "Int32")
    received: list[object] = []
    event = asyncio.Event()

    def on_change(value: object) -> None:
        received.append(value)
        if value == 99:
            event.set()

    await opcua_client.register_listener(address.topic, on_change)

    new_server, new_node = await _simulate_outage_and_recover(
        opcua_client, opcua_server.server, opcua_server.endpoint, opcua_server.idx
    )
    try:
        await new_node.write_value(99, ua.VariantType.Int32)
        await asyncio.wait_for(event.wait(), timeout=5)
    finally:
        with contextlib.suppress(Exception):
            await new_server.stop()

    assert received[-1] == 99


async def test_one_address_failing_to_resubscribe_does_not_block_the_others(
    opcua_client: OpcuaTransportClient, opcua_server: OpcuaServerHandle
) -> None:
    """One listened address failing to resubscribe must not stop the others
    from resubscribing. `_restart_server` only recreates the Int32 node, so
    a listener on String has nothing to resubscribe to on the new server."""
    ok_address = string_address(opcua_server.idx, "Int32")
    missing_address = string_address(opcua_server.idx, "String")
    received: list[object] = []
    event = asyncio.Event()

    def on_change(value: object) -> None:
        received.append(value)
        if value == 99:
            event.set()

    await opcua_client.register_listener(ok_address.topic, on_change)
    await opcua_client.register_listener(missing_address.topic, lambda _v: None)

    new_server, new_node = await _simulate_outage_and_recover(
        opcua_client, opcua_server.server, opcua_server.endpoint, opcua_server.idx
    )
    try:
        assert ok_address.topic in opcua_client._monitored_items  # noqa: SLF001
        assert missing_address.topic not in opcua_client._monitored_items  # noqa: SLF001

        await new_node.write_value(99, ua.VariantType.Int32)
        await asyncio.wait_for(event.wait(), timeout=5)
    finally:
        with contextlib.suppress(Exception):
            await new_server.stop()

    assert received[-1] == 99


async def test_repeated_outage_cycles_leak_no_monitored_items_or_listeners(
    opcua_client: OpcuaTransportClient, opcua_server: OpcuaServerHandle
) -> None:
    """Repeated outage cycles must not accumulate MonitoredItems or
    listeners — each cycle tears the old session down and rebuilds exactly
    the state that was there before, not more."""
    address = string_address(opcua_server.idx, "Int32")
    listener_id = await opcua_client.register_listener(address.topic, lambda _v: None)

    current_server = opcua_server.server
    for _ in range(3):
        current_server, _new_node = await _simulate_outage_and_recover(
            opcua_client, current_server, opcua_server.endpoint, opcua_server.idx
        )

        assert opcua_client._monitored_items.keys() == {address.topic}  # noqa: SLF001
        assert opcua_client._handlers_registry.address_ids() == {address.topic}  # noqa: SLF001

    await opcua_client.unregister_listener(listener_id, address.topic)
    assert opcua_client._monitored_items == {}  # noqa: SLF001

    with contextlib.suppress(Exception):
        await current_server.stop()
