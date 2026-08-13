import asyncio

import pytest
from asyncua import ua
from conftest import OpcuaServerHandle, string_address

from devices_manager.core.transports.opcua_transport.client import OpcuaTransportClient

pytestmark = [pytest.mark.asyncio, pytest.mark.integration]


async def _wait_for(event: asyncio.Event, *, timeout_s: float = 5.0) -> None:
    await asyncio.wait_for(event.wait(), timeout=timeout_s)


def _noop(_value: object) -> None:
    pass


async def test_datachange_notification_delivers_within_sampling_interval(
    opcua_client: OpcuaTransportClient, opcua_server: OpcuaServerHandle
) -> None:
    """Creating a MonitoredItem fires an immediate notification with the
    node's current value, before any write — waiting for the target value
    (not just the first callback) skips past that initial snapshot."""
    address = string_address(opcua_server.idx, "Int32")
    received: list[object] = []
    event = asyncio.Event()

    def on_change(value: object) -> None:
        received.append(value)
        if value == 99:
            event.set()

    await opcua_client.register_listener(address.topic, on_change)
    await opcua_server.nodes["Int32"].write_value(99, ua.VariantType.Int32)

    await _wait_for(event)
    assert received[-1] == 99


async def test_multiple_listeners_on_one_node_all_fire(
    opcua_client: OpcuaTransportClient, opcua_server: OpcuaServerHandle
) -> None:
    address = string_address(opcua_server.idx, "Int32")
    first_event, second_event = asyncio.Event(), asyncio.Event()
    first_values: list[object] = []
    second_values: list[object] = []

    def on_change_first(value: object) -> None:
        first_values.append(value)
        if value == 7:
            first_event.set()

    def on_change_second(value: object) -> None:
        second_values.append(value)
        if value == 7:
            second_event.set()

    await opcua_client.register_listener(address.topic, on_change_first)
    await opcua_client.register_listener(address.topic, on_change_second)
    await opcua_server.nodes["Int32"].write_value(7, ua.VariantType.Int32)

    await _wait_for(first_event)
    await _wait_for(second_event)
    assert first_values[-1] == 7
    assert second_values[-1] == 7


async def test_register_listener_on_unknown_node_raises(
    opcua_client: OpcuaTransportClient, opcua_server: OpcuaServerHandle
) -> None:
    address = string_address(opcua_server.idx, "DoesNotExist")
    with pytest.raises(ua.uaerrors.BadNodeIdUnknown):
        await opcua_client.register_listener(address.topic, _noop)


async def test_unregister_stops_delivery(
    opcua_client: OpcuaTransportClient, opcua_server: OpcuaServerHandle
) -> None:
    address = string_address(opcua_server.idx, "Int32")
    received: list[object] = []

    listener_id = await opcua_client.register_listener(address.topic, received.append)
    await opcua_client.unregister_listener(listener_id, address.topic)
    await opcua_server.nodes["Int32"].write_value(123, ua.VariantType.Int32)

    # No event to wait on for an absence — sleep past the sampling interval.
    await asyncio.sleep(1.5)
    assert received == []


async def test_unregister_last_listener_deletes_subscription(
    opcua_client: OpcuaTransportClient, opcua_server: OpcuaServerHandle
) -> None:
    address = string_address(opcua_server.idx, "Int32")
    listener_id = await opcua_client.register_listener(address.topic, _noop)
    assert opcua_client._subscription is not None  # noqa: SLF001

    await opcua_client.unregister_listener(listener_id, address.topic)
    assert opcua_client._subscription is None  # noqa: SLF001


async def test_unregister_one_of_several_listeners_keeps_subscription(
    opcua_client: OpcuaTransportClient, opcua_server: OpcuaServerHandle
) -> None:
    address = string_address(opcua_server.idx, "Int32")
    first_id = await opcua_client.register_listener(address.topic, _noop)
    await opcua_client.register_listener(address.topic, _noop)

    await opcua_client.unregister_listener(first_id, address.topic)
    assert opcua_client._subscription is not None  # noqa: SLF001
    assert "ns=%d;s=Int32" % opcua_server.idx in opcua_client._monitored_items  # noqa: SLF001, UP031


async def test_datachange_uses_same_decode_path_as_read(
    opcua_client: OpcuaTransportClient, opcua_server: OpcuaServerHandle
) -> None:
    """ExtensionObject notifications flatten to a dict, same as a read."""
    address = string_address(opcua_server.idx, "ExtensionObject")
    received: list[object] = []
    event = asyncio.Event()

    def on_change(value: object) -> None:
        received.append(value)
        if isinstance(value, dict) and value.get("Name") == "Updated":
            event.set()

    await opcua_client.register_listener(address.topic, on_change)
    await opcua_server.nodes["ExtensionObject"].write_value(
        ua.Argument(Name="Updated", ValueRank=ua.Int32(-1)),
        ua.VariantType.ExtensionObject,
    )

    await _wait_for(event)
    updated = received[-1]
    assert isinstance(updated, dict)
    assert updated["Name"] == "Updated"
    assert updated["ValueRank"] == -1


async def test_close_is_idempotent_after_subscribing(
    opcua_client: OpcuaTransportClient, opcua_server: OpcuaServerHandle
) -> None:
    address = string_address(opcua_server.idx, "Int32")
    await opcua_client.register_listener(address.topic, _noop)

    await opcua_client.close()
    await opcua_client.close()  # must not raise
    assert opcua_client._subscription is None  # noqa: SLF001


async def test_unregister_listener_twice_is_idempotent(
    opcua_client: OpcuaTransportClient, opcua_server: OpcuaServerHandle
) -> None:
    address = string_address(opcua_server.idx, "Int32")
    listener_id = await opcua_client.register_listener(address.topic, _noop)

    await opcua_client.unregister_listener(listener_id, address.topic)
    await opcua_client.unregister_listener(listener_id, address.topic)  # must not raise
