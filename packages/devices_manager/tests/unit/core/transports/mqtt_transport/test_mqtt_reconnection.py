"""A broker that drops the session: the transport notices, reconnects and
listens again, without a read to wake it up.

The stand-in client yields to the event loop on every call, like aiomqtt: a
task cancelled from inside ``close()`` only notices at its next await, so a
mock that never suspends would hide exactly that.
"""

# ruff: noqa: SLF001
# The receive loop and the reconnect task are the behaviour under test.

from __future__ import annotations

import asyncio
from typing import Self
from unittest.mock import Mock

import aiomqtt
import pytest
import pytest_asyncio

from devices_manager.core.transports.mqtt_transport import (
    MqttAddress,
    MqttTransportClient,
    MqttTransportConfig,
)
from devices_manager.core.transports.transport_metadata import TransportMetadata


class _Messages:
    """aiomqtt's iterator: it ends with ``MqttError`` on any disconnection."""

    def __init__(self) -> None:
        self.ended = asyncio.Event()
        self.error: Exception = aiomqtt.MqttError(
            "Disconnected during message iteration"
        )

    def __aiter__(self) -> _Messages:
        return self

    async def __anext__(self) -> object:
        await self.ended.wait()
        raise self.error


class FakeClient:
    def __init__(self) -> None:
        self.subscriptions: list[object] = []
        self.exited = False
        self.refuse_connect = False
        self.refuse_subscribe = False
        self.messages = _Messages()

    async def __aenter__(self) -> Self:
        await asyncio.sleep(0)
        if self.refuse_connect:
            msg = "Connection refused"
            raise aiomqtt.MqttError(msg)
        return self

    async def __aexit__(self, *_exc: object) -> None:
        await asyncio.sleep(0)
        self.exited = True
        self.messages.ended.set()

    async def subscribe(self, topic: object, *_args: object, **_kw: object) -> None:
        await asyncio.sleep(0)
        if self.refuse_subscribe:
            msg = "Operation timed out"
            raise aiomqtt.MqttError(msg)
        self.subscriptions.append(topic)

    def drop(self, error: Exception | None = None) -> None:
        """The broker closes the session, or the iterator fails with ``error``."""
        if error is not None:
            self.messages.error = error
        self.messages.ended.set()


@pytest.fixture
def clients(monkeypatch) -> list[FakeClient]:
    created: list[FakeClient] = []

    def build(*_args: object, **_kwargs: object) -> FakeClient:
        created.append(FakeClient())
        return created[-1]

    monkeypatch.setattr(aiomqtt, "Client", build)
    return created


@pytest_asyncio.fixture
async def transport(clients):  # noqa: ARG001 - aiomqtt is patched for its lifetime
    client = MqttTransportClient(
        TransportMetadata(id="broker", name="Broker"),
        MqttTransportConfig(host="broker.test"),
    )
    yield client
    await client.close()


async def _settle(transport: MqttTransportClient) -> None:
    """Let the receive loop react, then wait for any reconnect it scheduled."""
    for _ in range(10):
        await asyncio.sleep(0)
    if transport._reconnect_task is not None:
        await asyncio.wait({transport._reconnect_task})


@pytest.mark.asyncio
async def test_a_dropped_session_reconnects_and_listens_again(transport, clients):
    reconnects: list[int] = []
    transport.add_reconnect_listener(lambda: reconnects.append(1))
    await transport.register_listener(MqttAddress(topic="devices/a"), Mock())
    await transport.register_listener(MqttAddress(topic="devices/b"), Mock())

    clients[0].drop()
    await _settle(transport)

    assert transport.connection_state.is_connected
    assert len(clients) == 2
    assert clients[0].exited
    # A broker forgets the subscriptions of a session it dropped.
    assert clients[1].subscriptions == [[("devices/a", 0), ("devices/b", 0)]]
    assert reconnects == [1]


@pytest.mark.asyncio
async def test_a_scheduled_reconnect_is_not_cancelled_by_its_own_close(
    transport, clients
):
    await transport.connect()
    transport.schedule_reconnect()
    await _settle(transport)

    assert transport.connection_state.is_connected
    assert len(clients) == 2


@pytest.mark.asyncio
async def test_a_deliberate_close_is_not_a_lost_session(transport, clients):
    await transport.connect()
    await transport.close()
    await _settle(transport)

    assert transport._reconnect_task is None
    assert not transport.connection_state.is_connected
    assert clients[0].exited


@pytest.mark.asyncio
async def test_a_failed_resubscribe_leaves_no_client_behind(
    transport, clients, monkeypatch
):
    await transport.register_listener(MqttAddress(topic="devices/a"), Mock())
    await transport.close()
    refusing = FakeClient()
    refusing.refuse_subscribe = True
    monkeypatch.setattr(aiomqtt, "Client", lambda *_args, **_kwargs: refusing)

    with pytest.raises(aiomqtt.MqttError):
        await transport.connect()

    assert refusing.exited
    assert not transport.connection_state.is_connected
    assert transport._client_instance is None
    assert len(clients) == 1


@pytest.mark.asyncio
async def test_closing_after_the_receive_loop_failed_does_not_raise(transport, clients):
    """Only a lost session reconnects; a loop that failed otherwise must not
    turn the next close() into an error, or the service could not stop."""
    await transport.connect()
    receiving = transport._message_task
    clients[0].drop(RuntimeError("bug in a handler path"))
    await _settle(transport)

    await transport.close()

    assert transport._reconnect_task is None
    assert isinstance(receiving.exception(), RuntimeError)


class _AckingClient(FakeClient):
    """Ends its message iterator, then waits for the broker to acknowledge."""

    async def __aexit__(self, *_exc: object) -> None:
        self.exited = True
        self.messages.ended.set()
        await asyncio.sleep(0)


@pytest.mark.asyncio
async def test_a_deliberate_close_never_reconnects_whatever_the_client_teardown(
    transport, monkeypatch
):
    """Receiving stops before the client leaves, so even a client that ends
    its iterator before acknowledging the disconnection is not taken for a
    dropped session."""
    monkeypatch.setattr(aiomqtt, "Client", lambda *_args, **_kwargs: _AckingClient())
    await transport.connect()
    await transport.close()
    await _settle(transport)

    assert transport._reconnect_task is None
    assert not transport.connection_state.is_connected


@pytest.mark.asyncio
async def test_a_read_that_reconnects_first_leaves_the_dropped_client(
    transport, clients, monkeypatch
):
    """A read can reconnect, through ``@connected``, before the scheduled
    reconnection runs: the dropped client is still left properly."""
    monkeypatch.setattr(transport, "schedule_reconnect", lambda: None)
    await transport.connect()
    clients[0].drop()
    await _settle(transport)
    assert not transport.connection_state.is_connected

    await transport.connect()  # what the read's @connected does

    assert clients[0].exited
    assert transport.connection_state.is_connected


@pytest.mark.asyncio
async def test_closing_ends_a_reconnection_waiting_for_the_broker(
    transport, clients, monkeypatch
):
    """A transport deleted, or a service stopping, while the broker is away
    must stay closed when the broker comes back."""
    broker = {"up": True}

    def build(*_args: object, **_kwargs: object) -> FakeClient:
        client = FakeClient()
        client.refuse_connect = not broker["up"]
        clients.append(client)
        return client

    monkeypatch.setattr(aiomqtt, "Client", build)
    monkeypatch.setattr(transport, "_reconnect_base_delay", 0.01)
    await transport.connect()
    broker["up"] = False
    clients[0].drop()
    await asyncio.sleep(0.05)  # refused attempts, then waiting in backoff
    await transport.close()
    attempts = len(clients)
    broker["up"] = True
    await asyncio.sleep(0.2)

    assert len(clients) == attempts
    assert not transport.connection_state.is_connected


@pytest.mark.asyncio
async def test_a_cancelled_close_is_cancelled(transport):
    """A caller that gives up on close() (a shutdown timeout) gets its own
    cancellation, even while close() waits for the receive loop to end."""
    await transport.connect()
    closing = asyncio.create_task(transport.close())
    await asyncio.sleep(0)  # close() now waits for the receive loop
    closing.cancel()

    with pytest.raises(asyncio.CancelledError):
        await closing
