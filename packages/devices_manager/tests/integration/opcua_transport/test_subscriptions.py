import asyncio
from typing import Any

import pytest
from asyncua import ua
from conftest import OpcuaServerHandle, string_address, wait_until

from devices_manager.core.transports.opcua_transport.client import OpcuaTransportClient

pytestmark = [pytest.mark.asyncio, pytest.mark.integration]


async def _write_with_status(
    server: OpcuaServerHandle,
    name: str,
    value: object,
    variant_type: ua.VariantType,
    status_code: int,
) -> None:
    node = server.nodes[name]
    data_value = ua.DataValue(
        Value=ua.Variant(value, variant_type),
        StatusCode=ua.StatusCode(status_code),  # ty: ignore[invalid-argument-type]
    )
    await node.write_value(data_value)


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

    await wait_until(event.is_set)
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

    await wait_until(first_event.is_set)
    await wait_until(second_event.is_set)
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
    assert address.topic in opcua_client._monitored_items  # noqa: SLF001


async def test_datachange_uses_same_decode_path_as_read(
    opcua_client: OpcuaTransportClient, opcua_server: OpcuaServerHandle
) -> None:
    """ExtensionObject notifications flatten to a dict, same as a read."""
    address = string_address(opcua_server.idx, "ExtensionObject")
    received: list[Any] = []
    event = asyncio.Event()

    def on_change(value: Any) -> None:
        received.append(value)
        if isinstance(value, dict) and value.get("Name") == "Updated":
            event.set()

    await opcua_client.register_listener(address.topic, on_change)
    await opcua_server.nodes["ExtensionObject"].write_value(
        ua.Argument(Name="Updated", ValueRank=ua.Int32(-1)),
        ua.VariantType.ExtensionObject,
    )

    await wait_until(event.is_set)
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


async def test_reconnect_resubscribes_existing_listeners(
    opcua_client: OpcuaTransportClient, opcua_server: OpcuaServerHandle
) -> None:
    """close() clears _subscription/_monitored_items but not the
    ListenerRegistry — connect() must resubscribe or push silently stops."""
    address = string_address(opcua_server.idx, "Int32")
    received: list[object] = []
    event = asyncio.Event()

    def on_change(value: object) -> None:
        received.append(value)
        if value == 55:
            event.set()

    await opcua_client.register_listener(address.topic, on_change)

    await opcua_client.close()
    await opcua_client.connect()

    assert address.topic in opcua_client._monitored_items  # noqa: SLF001
    await opcua_server.nodes["Int32"].write_value(55, ua.VariantType.Int32)
    await wait_until(event.is_set)
    assert received[-1] == 55


async def test_reconnect_with_no_listeners_does_not_create_subscription(
    opcua_client: OpcuaTransportClient,
) -> None:
    await opcua_client.close()
    await opcua_client.connect()
    assert opcua_client._subscription is None  # noqa: SLF001


async def test_register_listener_with_malformed_topic_leaves_no_subscription(
    opcua_client: OpcuaTransportClient,
) -> None:
    """A parse failure must not leave a dangling, unused Subscription."""
    with pytest.raises(ua.uaerrors.UaStringParsingError):
        await opcua_client.register_listener("not-a-nodeid", _noop)
    assert opcua_client._subscription is None  # noqa: SLF001


async def test_datachange_with_uncertain_status_is_still_delivered(
    opcua_client: OpcuaTransportClient, opcua_server: OpcuaServerHandle
) -> None:
    """Uncertain still carries a usable value — only Bad should be dropped."""
    address = string_address(opcua_server.idx, "Int32")
    received: list[object] = []
    event = asyncio.Event()

    def on_change(value: object) -> None:
        received.append(value)
        if value == 88:
            event.set()

    await opcua_client.register_listener(address.topic, on_change)
    await _write_with_status(
        opcua_server,
        "Int32",
        88,
        ua.VariantType.Int32,
        ua.StatusCodes.UncertainLastUsableValue,
    )

    await wait_until(event.is_set)
    assert received[-1] == 88


async def test_datachange_with_bad_status_is_dropped_not_delivered(
    opcua_client: OpcuaTransportClient, opcua_server: OpcuaServerHandle
) -> None:
    address = string_address(opcua_server.idx, "Int32")
    received: list[object] = []

    await opcua_client.register_listener(address.topic, received.append)
    await _write_with_status(
        opcua_server, "Int32", 77, ua.VariantType.Int32, ua.StatusCodes.BadSensorFailure
    )

    # No event to wait on for an absence — sleep past the sampling interval.
    await asyncio.sleep(1.5)
    assert 77 not in received


async def test_register_listener_delete_failure_does_not_shadow_original_error(
    opcua_client: OpcuaTransportClient,
    opcua_server: OpcuaServerHandle,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """delete()'s own error must not shadow the original BadNodeIdUnknown."""

    async def failing_delete(_self: object) -> None:
        raise RuntimeError("boom from delete")  # noqa: TRY003

    monkeypatch.setattr(
        "asyncua.common.subscription.Subscription.delete", failing_delete
    )
    address = string_address(opcua_server.idx, "DoesNotExist")

    with pytest.raises(ua.uaerrors.BadNodeIdUnknown):
        await opcua_client.register_listener(address.topic, _noop)
    assert opcua_client._subscription is None  # noqa: SLF001


async def test_unregister_last_listener_delete_failure_does_not_raise(
    opcua_client: OpcuaTransportClient,
    opcua_server: OpcuaServerHandle,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Same as register_listener: a delete() failure must not raise here."""
    address = string_address(opcua_server.idx, "Int32")
    listener_id = await opcua_client.register_listener(address.topic, _noop)

    async def failing_delete(_self: object) -> None:
        raise RuntimeError("boom from delete")  # noqa: TRY003

    monkeypatch.setattr(
        "asyncua.common.subscription.Subscription.delete", failing_delete
    )

    await opcua_client.unregister_listener(listener_id, address.topic)  # must not raise
    assert opcua_client._subscription is None  # noqa: SLF001


async def test_ensure_subscription_recreates_after_dangling_deleted_subscription(
    opcua_client: OpcuaTransportClient, opcua_server: OpcuaServerHandle
) -> None:
    """A dangling deleted Subscription must be detected via is_deleted and
    recreated, not reused."""
    address = string_address(opcua_server.idx, "Int32")
    await opcua_client.register_listener(address.topic, _noop)
    dead_subscription = opcua_client._subscription  # noqa: SLF001
    assert dead_subscription is not None
    await dead_subscription.delete()
    opcua_client._monitored_items.clear()  # noqa: SLF001 — force re-subscribe below

    await opcua_client.register_listener(address.topic, _noop)

    assert opcua_client._subscription is not None  # noqa: SLF001
    assert opcua_client._subscription is not dead_subscription  # noqa: SLF001
