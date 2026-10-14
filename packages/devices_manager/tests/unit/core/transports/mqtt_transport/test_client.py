import asyncio
import socket
import ssl
import tempfile
import threading
from pathlib import Path
from unittest.mock import AsyncMock, Mock, call, patch

import aiomqtt
import pytest
from aiomqtt import Topic

from devices_manager.core.transports.mqtt_transport import (
    MqttAddress,
    MqttTransportClient,
    MqttTransportConfig,
)
from devices_manager.core.transports.mqtt_transport import (
    client as client_module,
)
from devices_manager.core.transports.mqtt_transport.client import build_ssl_context
from devices_manager.core.transports.mqtt_transport.mqtt_address import (
    MqttFrameMatch,
    MqttRequest,
)
from devices_manager.core.transports.transport_connection_state import (
    TransportConnectionState,
)
from devices_manager.core.transports.transport_metadata import TransportMetadata


def _serve_one_mtls_connection(
    server_socket: socket.socket, server_context: ssl.SSLContext, result: dict
) -> None:
    conn, _ = server_socket.accept()
    try:
        with server_context.wrap_socket(conn, server_side=True) as tls_conn:
            result["peer_cert"] = tls_conn.getpeercert()
    except ssl.SSLError as exc:
        result["error"] = exc


def _run_mtls_handshake(client_context: ssl.SSLContext, test_pki: dict) -> dict:
    server_context = ssl.SSLContext(ssl.PROTOCOL_TLS_SERVER)
    server_context.load_verify_locations(cadata=test_pki["ca_cert"])
    server_context.verify_mode = ssl.CERT_REQUIRED

    with tempfile.TemporaryDirectory() as tmp_dir:
        cert_path = Path(tmp_dir) / "server_cert.pem"
        key_path = Path(tmp_dir) / "server_key.pem"
        cert_path.write_text(test_pki["server_cert"])
        key_path.write_text(test_pki["server_key"])
        server_context.load_cert_chain(certfile=cert_path, keyfile=key_path)

        server_socket = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        server_socket.bind(("localhost", 0))
        server_socket.listen(1)
        port = server_socket.getsockname()[1]

        result: dict = {}
        thread = threading.Thread(
            target=_serve_one_mtls_connection,
            args=(server_socket, server_context, result),
        )
        thread.start()
        try:
            with socket.create_connection(("localhost", port), timeout=5) as sock:
                try:
                    with client_context.wrap_socket(
                        sock, server_hostname="localhost"
                    ) as tls_sock:
                        tls_sock.do_handshake()
                except ssl.SSLError as exc:
                    result["client_error"] = exc
        finally:
            thread.join(timeout=5)
            server_socket.close()
        return result


def _tls_config(test_pki: dict, *, with_client_cert: bool) -> MqttTransportConfig:
    return MqttTransportConfig(
        host="test.broker",
        tls=True,
        ca_cert=test_pki["ca_cert"],
        client_cert=test_pki["client_cert"] if with_client_cert else None,
        client_key=test_pki["client_key"] if with_client_cert else None,
    )


@pytest.fixture
def mock_aiomqtt_client():
    with (
        patch("aiomqtt.Client") as mock_client_class,
        patch("asyncio.wait_for") as mock_wait_for,
    ):
        mock_client = AsyncMock()
        mock_client.__aenter__.return_value = mock_client
        mock_client_class.return_value = mock_client

        async def mock_wait_for_coroutine(coroutine, timeout):  # noqa: ANN202, ARG001, ASYNC109
            return await coroutine

        mock_wait_for.side_effect = mock_wait_for_coroutine
        yield mock_client


@pytest.fixture
def mock_config():
    return MqttTransportConfig(host="test.broker", port=1883)


@pytest.fixture
def mock_metadata():
    return TransportMetadata(id="mqtt1", name="My MQTT broker")


@pytest.fixture
def mqtt_client(
    mock_metadata,
    mock_config: MqttTransportConfig,
    mock_aiomqtt_client: AsyncMock,  # noqa: ARG001
):
    return MqttTransportClient(mock_metadata, mock_config)


@pytest.mark.asyncio
async def test_connect_success(
    mqtt_client: MqttTransportClient,
    mock_aiomqtt_client: AsyncMock,
):
    assert mqtt_client.connection_state.is_connected is False
    await mqtt_client.connect()
    assert mqtt_client.connection_state.is_connected is True
    mock_aiomqtt_client.__aenter__.assert_awaited_once()
    # _handle_incoming_messages task
    assert mqtt_client._message_task is not None  # noqa: SLF001


@pytest.mark.asyncio
async def test_connect_falls_back_to_plain_mqtt_when_tls_unset(
    mqtt_client: MqttTransportClient,
    mock_aiomqtt_client: AsyncMock,  # noqa: ARG001
):
    with patch("aiomqtt.Client") as mock_client_class:
        mock_client_class.return_value.__aenter__.return_value = AsyncMock()
        await mqtt_client.connect()
        _, kwargs = mock_client_class.call_args
        assert kwargs["tls_context"] is None
        assert kwargs["username"] is None
        assert kwargs["password"] is None


@pytest.mark.asyncio
async def test_connect_passes_tls_context_and_credentials(
    mock_metadata,
    test_pki: dict,
):
    config = MqttTransportConfig(
        host="test.broker",
        port=8883,
        tls=True,
        ca_cert=test_pki["ca_cert"],
        client_cert=test_pki["client_cert"],
        client_key=test_pki["client_key"],
        username="gridone",
        password="secret",
    )
    client = MqttTransportClient(mock_metadata, config)
    with (
        patch("aiomqtt.Client") as mock_client_class,
        patch("asyncio.wait_for") as mock_wait_for,
    ):
        mock_client_class.return_value.__aenter__.return_value = AsyncMock()

        async def mock_wait_for_coroutine(coroutine, timeout):  # noqa: ANN202, ARG001, ASYNC109
            return await coroutine

        mock_wait_for.side_effect = mock_wait_for_coroutine

        await client.connect()

        _, kwargs = mock_client_class.call_args
        assert kwargs["username"] == "gridone"
        assert kwargs["password"] == "secret"  # noqa: S105
        assert kwargs["tls_context"] is not None


@pytest.mark.asyncio
async def test_connect_builds_tls_context_off_the_event_loop(
    mock_metadata,
    test_pki: dict,
):
    """The blocking SSL setup must not run on the event loop, however it's offloaded.

    Asserts the observable property (which thread ran the SSL work) rather
    than pinning the exact offload mechanism (e.g. asyncio.to_thread), so this
    survives a refactor to e.g. run_in_executor.
    """
    config = MqttTransportConfig(
        host="test.broker",
        tls=True,
        ca_cert=test_pki["ca_cert"],
    )
    client = MqttTransportClient(mock_metadata, config)

    loop_thread = threading.get_ident()
    seen: dict[str, int] = {}
    original = ssl.SSLContext.load_verify_locations

    def spy(self, *args, **kwargs):  # noqa: ANN002, ANN003, ANN202
        seen["thread"] = threading.get_ident()
        return original(self, *args, **kwargs)

    with (
        patch.object(ssl.SSLContext, "load_verify_locations", spy),
        patch("aiomqtt.Client") as mock_client_class,
        patch("asyncio.wait_for") as mock_wait_for,
    ):
        mock_client_class.return_value.__aenter__.return_value = AsyncMock()

        async def mock_wait_for_coroutine(coroutine, timeout):  # noqa: ANN202, ARG001, ASYNC109
            return await coroutine

        mock_wait_for.side_effect = mock_wait_for_coroutine

        await client.connect()

        assert seen["thread"] != loop_thread


@pytest.mark.asyncio
async def test_connect_is_idempotent_when_already_connected(
    mqtt_client: MqttTransportClient,
    mock_aiomqtt_client: AsyncMock,
):
    """A redundant connect() must keep the live client.

    Rebuilding the client on a second connect() while leaving the state
    "connected" replaced the entered client with an un-entered one, so later
    reads/writes failed with "client is not currently connected".
    """
    await mqtt_client.connect()
    receiving = mqtt_client._message_task  # noqa: SLF001
    await mqtt_client.connect()

    mock_aiomqtt_client.__aenter__.assert_awaited_once()
    assert mqtt_client._message_task is receiving  # noqa: SLF001
    assert mqtt_client._client is mock_aiomqtt_client  # noqa: SLF001


@pytest.mark.asyncio
async def test_close(mqtt_client: MqttTransportClient, mock_aiomqtt_client: AsyncMock):
    await mqtt_client.connect()
    await mqtt_client.close()
    mock_aiomqtt_client.__aexit__.assert_awaited_once()
    assert mqtt_client.connection_state.is_connected is False
    assert mqtt_client._message_task is None  # noqa: SLF001


@pytest.mark.asyncio
async def test_subscribe(mqtt_client, mock_aiomqtt_client):
    await mqtt_client.connect()
    address = mqtt_client.build_address({"topic": "test/topic"})
    await mqtt_client.register_listener(address, Mock())
    mock_aiomqtt_client.subscribe.assert_awaited_once_with("test/topic")


@pytest.mark.asyncio
async def test_unsubscribe(mqtt_client, mock_aiomqtt_client):
    await mqtt_client.connect()
    address = mqtt_client.build_address({"topic": "test/topic"})
    listener_id = await mqtt_client.register_listener(address, Mock())
    await mqtt_client.unregister_listener(listener_id, "test/topic")
    mock_aiomqtt_client.unsubscribe.assert_awaited_once_with("test/topic")


@pytest.mark.asyncio
async def test_unregister_last_listener_unsubscribes_synchronously(
    mqtt_client, mock_aiomqtt_client
):
    # The unsubscribe must be awaited, not fired off as a detached task:
    # a sequential re-subscribe on the same topic would otherwise race it.
    await mqtt_client.connect()
    listener_id = await mqtt_client.register_listener(
        MqttAddress(topic="test/topic"), Mock()
    )
    await mqtt_client.unregister_listener(listener_id, "test/topic")
    mock_aiomqtt_client.unsubscribe.assert_awaited_once_with("test/topic")


class AsyncIteratorMock:
    def __init__(self, items) -> None:
        self._items = items

    def __aiter__(self):  # noqa: ANN204
        self._iter = iter(self._items)
        return self

    async def __anext__(self):  # noqa: ANN204
        try:
            return next(self._iter)
        except StopIteration:
            raise StopAsyncIteration  # noqa: B904


@pytest.fixture
def mqtt_read_address() -> MqttAddress:
    return MqttAddress(
        topic="test/topic",
        request=MqttRequest(topic="test/request", message="test_message"),
    )


@pytest.fixture
def mqtt_listen_address() -> MqttAddress:
    return MqttAddress(topic="test/topic")


@pytest.fixture
def mqtt_write_address() -> MqttAddress:
    return MqttAddress(
        topic="test/topic/set",
        message={"value": "${value}"},
    )


@pytest.mark.asyncio
async def test_handle_incoming_messages(
    mqtt_client, mock_aiomqtt_client, mqtt_read_address
):
    mock_message = AsyncMock()
    mock_message.topic = Topic("test/topic")
    mock_message.payload = b'{"value": 42}'

    callback = Mock()
    await mqtt_client.register_listener(mqtt_read_address, callback)

    mock_aiomqtt_client.messages = AsyncIteratorMock([mock_message])
    await mqtt_client._handle_incoming_messages(mock_aiomqtt_client)  # noqa: SLF001

    callback.assert_called_once_with('{"value": 42}')


@pytest.mark.asyncio
async def test_a_binary_frame_does_not_end_reception(
    mqtt_client, mock_aiomqtt_client, mqtt_listen_address
):
    callback = Mock()
    await mqtt_client.register_listener(mqtt_listen_address, callback)
    binary = AsyncMock()
    binary.topic = Topic("test/topic")
    binary.payload = b"\xff\xfe"

    mock_aiomqtt_client.messages = AsyncIteratorMock(
        [binary, _message("test/topic", "42")]
    )
    await mqtt_client._handle_incoming_messages(mock_aiomqtt_client)  # noqa: SLF001

    callback.assert_called_once_with("42")


class TestRead:
    @pytest.mark.asyncio
    async def test_read_with_request_publishes_trigger(
        self, mqtt_client, mock_aiomqtt_client, mqtt_read_address
    ):
        await mqtt_client.connect()

        mock_message = AsyncMock()
        mock_message.topic = Topic("test/topic")
        mock_message.payload = b"42"

        original_register = mqtt_client.register_listener

        async def register_and_deliver(address, callback):  # noqa: ANN202
            listener_id = await original_register(address, callback)
            callback("42")
            return listener_id

        mqtt_client.register_listener = register_and_deliver

        result = await mqtt_client.read(mqtt_read_address)
        assert result == "42"
        mock_aiomqtt_client.publish.assert_awaited_once_with(
            "test/request", payload="test_message", timeout=10
        )

    @pytest.mark.asyncio
    async def test_read_listen_only_does_not_publish(
        self, mqtt_client, mock_aiomqtt_client, mqtt_listen_address
    ):
        await mqtt_client.connect()

        original_register = mqtt_client.register_listener

        async def register_and_deliver(address, callback):  # noqa: ANN202
            listener_id = await original_register(address, callback)
            callback("pushed_value")
            return listener_id

        mqtt_client.register_listener = register_and_deliver

        result = await mqtt_client.read(mqtt_listen_address)
        assert result == "pushed_value"
        mock_aiomqtt_client.publish.assert_not_awaited()


def _message(topic: str, payload: str) -> AsyncMock:
    message = AsyncMock()
    message.topic = Topic(topic)
    message.payload = payload.encode()
    return message


class TestListenerWithMatch:
    """Every attribute of a push device listens on the same topic; the address
    it was built from tells the transport which frames concern it, so the
    others never reach its codec."""

    @pytest.mark.asyncio
    async def test_only_receives_the_frames_its_match_accepts(
        self, mqtt_client, mock_aiomqtt_client
    ):
        address = MqttAddress(
            topic="test/topic", match=MqttFrameMatch(regex='"name":"wanted"')
        )
        callback = Mock()
        await mqtt_client.register_listener(address, callback)

        mock_aiomqtt_client.messages = AsyncIteratorMock(
            [
                _message("test/topic", '{"name":"other"}'),
                _message("test/topic", '{"name":"wanted"}'),
            ]
        )
        await mqtt_client._handle_incoming_messages(mock_aiomqtt_client)  # noqa: SLF001

        callback.assert_called_once_with('{"name":"wanted"}')

    @pytest.mark.asyncio
    async def test_address_without_match_receives_every_frame(
        self, mqtt_client, mock_aiomqtt_client
    ):
        address = MqttAddress(topic="test/topic")
        callback = Mock()
        await mqtt_client.register_listener(address, callback)

        mock_aiomqtt_client.messages = AsyncIteratorMock(
            [
                _message("test/topic", '{"name":"other"}'),
                _message("test/topic", '{"name":"wanted"}'),
            ]
        )
        await mqtt_client._handle_incoming_messages(mock_aiomqtt_client)  # noqa: SLF001

        assert callback.call_count == 2


class TestReadWithMatch:
    """A read on a reply topic shared by every attribute of a device may
    receive frames meant for other reads before its own; ``match`` tells the
    transport which frame is the reply."""

    @pytest.fixture
    def matched_address(self, mqtt_read_address) -> MqttAddress:
        return mqtt_read_address.model_copy(
            update={"match": MqttFrameMatch(json_path='$.data[?(@.name == "wanted")]')}
        )

    @staticmethod
    def _deliver_on_register(mqtt_client, frames: list[str]) -> None:
        original_register = mqtt_client.register_listener

        async def register_and_deliver(address, callback):  # noqa: ANN202
            listener_id = await original_register(address, callback)
            for frame in frames:
                callback(frame)
            return listener_id

        mqtt_client.register_listener = register_and_deliver

    @pytest.mark.asyncio
    async def test_read_skips_frames_that_do_not_match(
        self, mqtt_client, matched_address
    ):
        await mqtt_client.connect()
        self._deliver_on_register(
            mqtt_client,
            [
                "not json at all",
                '{"data": [{"name": "other", "value": 1}]}',
                '{"data": [{"name": "wanted", "value": 2}]}',
            ],
        )

        result = await mqtt_client.read(matched_address)

        assert result == '{"data": [{"name": "wanted", "value": 2}]}'

    @pytest.mark.asyncio
    async def test_read_times_out_when_no_frame_matches(
        self, mqtt_client, matched_address, monkeypatch
    ):
        monkeypatch.setattr(client_module, "TIMEOUT", 0.01)
        await mqtt_client.connect()
        self._deliver_on_register(
            mqtt_client, ['{"data": [{"name": "other", "value": 1}]}']
        )

        with pytest.raises(TimeoutError, match="no reply"):
            await mqtt_client.read(matched_address)


async def _deliver(mqtt_client: MqttTransportClient, *messages: AsyncMock) -> None:
    """Run frames through the transport's receive loop, as the broker would."""
    broker = Mock()
    broker.messages = AsyncIteratorMock(list(messages))
    await mqtt_client._handle_incoming_messages(broker)  # noqa: SLF001


async def _yield_to_others() -> None:
    """Let every other task run as far as it can before the test goes on."""
    for _ in range(10):
        await asyncio.sleep(0)


def _listening(mqtt_client: MqttTransportClient, topic: str) -> set[str]:
    """The listener ids that a frame on ``topic`` is dispatched to."""
    return mqtt_client._message_handlers.get_by_topic(topic)  # noqa: SLF001


class TestOneSubscribePerTopic:
    """Every attribute of a device listens on the device's topic, and a driver
    save registers them all again at once (AGR-1695). The broker must see one
    SUBSCRIBE per topic, confirmed before any listener of the topic is in
    place, and one UNSUBSCRIBE once the last listener has left."""

    @staticmethod
    def _attribute(name: str) -> MqttAddress:
        """One attribute of a thermostat: the device's topic, its own frames."""
        return MqttAddress(
            topic="updData/AA", match=MqttFrameMatch(contains=f'"{name}"')
        )

    @pytest.mark.asyncio
    async def test_the_listeners_of_one_topic_share_one_subscribe(
        self, mqtt_client, mock_aiomqtt_client
    ):
        await mqtt_client.connect()
        for name in ("Temperature", "Humidity", "Setpoint"):
            await mqtt_client.register_listener(self._attribute(name), Mock())

        mock_aiomqtt_client.subscribe.assert_awaited_once_with("updData/AA")

    @pytest.mark.asyncio
    async def test_each_topic_is_subscribed_once(
        self, mqtt_client, mock_aiomqtt_client
    ):
        await mqtt_client.connect()
        for topic in ("updData/AA", "updData/BB", "updData/AA", "updData/BB"):
            await mqtt_client.register_listener(MqttAddress(topic=topic), Mock())

        assert mock_aiomqtt_client.subscribe.await_args_list == [
            call("updData/AA"),
            call("updData/BB"),
        ]

    @pytest.mark.asyncio
    async def test_a_listener_connects_a_transport_not_connected_yet(
        self, mqtt_client, mock_aiomqtt_client
    ):
        await mqtt_client.register_listener(MqttAddress(topic="updData/AA"), Mock())

        assert mqtt_client.connection_state.is_connected
        mock_aiomqtt_client.__aenter__.assert_awaited_once()
        mock_aiomqtt_client.subscribe.assert_awaited_once_with("updData/AA")

    @pytest.mark.asyncio
    async def test_concurrent_first_listeners_all_wait_for_one_subscribe(
        self, mqtt_client, mock_aiomqtt_client
    ):
        await mqtt_client.connect()
        subscribing = asyncio.Event()
        suback = asyncio.Event()

        async def subscribe(*_args: object, **_kwargs: object) -> None:
            subscribing.set()
            await suback.wait()

        mock_aiomqtt_client.subscribe.side_effect = subscribe
        async with asyncio.timeout(5):
            registering = [
                asyncio.create_task(
                    mqtt_client.register_listener(self._attribute(f"a{i}"), Mock())
                )
                for i in range(20)
            ]
            await subscribing.wait()
            await _yield_to_others()
            # No attribute may count on the topic before the broker confirms it.
            assert not any(task.done() for task in registering)
            assert mock_aiomqtt_client.subscribe.await_count == 1
            suback.set()
            listener_ids = await asyncio.gather(*registering)

        mock_aiomqtt_client.subscribe.assert_awaited_once_with("updData/AA")
        assert len(set(listener_ids)) == 20
        assert _listening(mqtt_client, "updData/AA") == set(listener_ids)

    @pytest.mark.asyncio
    async def test_a_failed_subscribe_leaves_no_listener_and_is_tried_again(
        self, mqtt_client, mock_aiomqtt_client
    ):
        await mqtt_client.connect()
        mock_aiomqtt_client.subscribe.side_effect = [
            aiomqtt.MqttError("Operation timed out"),
            None,
        ]
        refused = Mock()
        with pytest.raises(aiomqtt.MqttError, match="timed out"):
            await mqtt_client.register_listener(
                MqttAddress(topic="updData/AA"), refused
            )

        assert _listening(mqtt_client, "updData/AA") == set()
        assert mqtt_client._handlers_registry.address_ids() == set()  # noqa: SLF001

        accepted = Mock()
        listener_id = await mqtt_client.register_listener(
            MqttAddress(topic="updData/AA"), accepted
        )
        assert mock_aiomqtt_client.subscribe.await_count == 2
        assert _listening(mqtt_client, "updData/AA") == {listener_id}
        await _deliver(mqtt_client, _message("updData/AA", "42"))
        refused.assert_not_called()
        accepted.assert_called_once_with("42")

    @pytest.mark.asyncio
    async def test_only_the_last_listener_to_leave_unsubscribes(
        self, mqtt_client, mock_aiomqtt_client
    ):
        await mqtt_client.connect()
        listener_ids = [
            await mqtt_client.register_listener(self._attribute(name), Mock())
            for name in ("Temperature", "Humidity", "Setpoint")
        ]
        for listener_id in listener_ids[:-1]:
            await mqtt_client.unregister_listener(listener_id, "updData/AA")
        mock_aiomqtt_client.unsubscribe.assert_not_awaited()

        await mqtt_client.unregister_listener(listener_ids[-1], "updData/AA")
        mock_aiomqtt_client.unsubscribe.assert_awaited_once_with("updData/AA")

    @pytest.mark.asyncio
    async def test_leaving_while_disconnected_sends_nothing_and_does_not_reconnect(
        self, mqtt_client, mock_aiomqtt_client
    ):
        await mqtt_client.connect()
        callback = Mock()
        listener_id = await mqtt_client.register_listener(
            MqttAddress(topic="updData/AA"), callback
        )
        # The session is lost and the scheduled reconnection has not run yet:
        # the broker has already forgotten the subscription.
        mqtt_client.connection_state = TransportConnectionState.connection_error(
            "session lost"
        )

        await mqtt_client.unregister_listener(listener_id, "updData/AA")

        mock_aiomqtt_client.unsubscribe.assert_not_awaited()
        # No reconnection: the first connect() is the only one to enter a client.
        mock_aiomqtt_client.__aenter__.assert_awaited_once()
        assert mqtt_client._reconnect_task is None  # noqa: SLF001
        assert not mqtt_client.connection_state.is_connected
        # Gone from the registry, so the next connect() does not subscribe it.
        assert "updData/AA" not in mqtt_client._message_handlers.list_topics()  # noqa: SLF001
        await _deliver(mqtt_client, _message("updData/AA", "42"))
        callback.assert_not_called()

    @pytest.mark.asyncio
    async def test_leaving_during_a_close_waits_for_it_and_sends_nothing(
        self, mqtt_client, mock_aiomqtt_client
    ):
        """A read's listener leaves in its ``finally``, possibly while a
        reconnection closes the client: it waits for close() to finish rather
        than reach a client that is already gone."""
        await mqtt_client.connect()
        listener_id = await mqtt_client.register_listener(
            MqttAddress(topic="updData/AA"), Mock()
        )
        leaving_client = asyncio.Event()
        disconnected = asyncio.Event()

        async def leave(*_exc: object) -> None:
            leaving_client.set()
            await disconnected.wait()

        mock_aiomqtt_client.__aexit__.side_effect = leave
        async with asyncio.timeout(5):
            closing = asyncio.create_task(mqtt_client.close())
            await leaving_client.wait()
            leaving = asyncio.create_task(
                mqtt_client.unregister_listener(listener_id, "updData/AA")
            )
            await _yield_to_others()
            assert not leaving.done()
            disconnected.set()
            await asyncio.gather(closing, leaving)

        mock_aiomqtt_client.unsubscribe.assert_not_awaited()
        assert _listening(mqtt_client, "updData/AA") == set()

    @pytest.mark.asyncio
    async def test_a_listener_leaves_at_once_even_when_its_caller_is_cancelled(
        self, mqtt_client, mock_aiomqtt_client
    ):
        """A read's listener leaves in its ``finally``. If the poll task is
        cancelled while that ``finally`` waits behind another topic's SUBACK,
        the listener must be gone all the same."""
        await mqtt_client.connect()
        callback = Mock()
        listener_id = await mqtt_client.register_listener(
            MqttAddress(topic="updData/AA"), callback
        )
        subscribing = asyncio.Event()
        suback = asyncio.Event()

        async def subscribe(*_args: object, **_kwargs: object) -> None:
            subscribing.set()
            await suback.wait()

        mock_aiomqtt_client.subscribe.side_effect = subscribe
        async with asyncio.timeout(5):
            # Another device's first listener holds the lock until its SUBACK.
            joining = asyncio.create_task(
                mqtt_client.register_listener(MqttAddress(topic="updData/BB"), Mock())
            )
            await subscribing.wait()
            leaving = asyncio.create_task(
                mqtt_client.unregister_listener(listener_id, "updData/AA")
            )
            await _yield_to_others()
            leaving.cancel()
            with pytest.raises(asyncio.CancelledError):
                await leaving
            suback.set()
            await joining

        assert _listening(mqtt_client, "updData/AA") == set()
        await _deliver(mqtt_client, _message("updData/AA", "42"))
        callback.assert_not_called()

    @pytest.mark.asyncio
    async def test_a_subscribe_never_overlaps_an_unsubscribe_of_its_topic(
        self, mqtt_client, mock_aiomqtt_client
    ):
        await mqtt_client.connect()
        last_id = await mqtt_client.register_listener(
            MqttAddress(topic="updData/AA"), Mock()
        )
        broker: list[str] = []
        unsubscribing = asyncio.Event()
        unsuback = asyncio.Event()

        async def subscribe(topic: str, *_args: object, **_kwargs: object) -> None:
            broker.append(f"SUBSCRIBE {topic}")
            await asyncio.sleep(0)
            broker.append("SUBACK")

        async def unsubscribe(topic: str, *_args: object, **_kwargs: object) -> None:
            broker.append(f"UNSUBSCRIBE {topic}")
            unsubscribing.set()
            await unsuback.wait()
            broker.append("UNSUBACK")

        mock_aiomqtt_client.subscribe.side_effect = subscribe
        mock_aiomqtt_client.unsubscribe.side_effect = unsubscribe
        async with asyncio.timeout(5):
            leaving = asyncio.create_task(
                mqtt_client.unregister_listener(last_id, "updData/AA")
            )
            await unsubscribing.wait()
            joining = asyncio.create_task(
                mqtt_client.register_listener(MqttAddress(topic="updData/AA"), Mock())
            )
            await _yield_to_others()
            assert broker == ["UNSUBSCRIBE updData/AA"]
            assert not joining.done()
            unsuback.set()
            _, joined_id = await asyncio.gather(leaving, joining)

        # The topic ends subscribed, for the one listener the registry holds.
        assert broker == [
            "UNSUBSCRIBE updData/AA",
            "UNSUBACK",
            "SUBSCRIBE updData/AA",
            "SUBACK",
        ]
        assert _listening(mqtt_client, "updData/AA") == {joined_id}

    @pytest.mark.asyncio
    async def test_a_read_on_a_listened_topic_neither_subscribes_nor_unsubscribes(
        self, mqtt_client, mock_aiomqtt_client, mqtt_read_address
    ):
        await mqtt_client.connect()
        listener = Mock()
        listener_id = await mqtt_client.register_listener(
            MqttAddress(topic="test/topic"), listener
        )

        async def reply(*_args: object, **_kwargs: object) -> None:
            await _deliver(mqtt_client, _message("test/topic", "42"))

        mock_aiomqtt_client.publish.side_effect = reply

        assert await mqtt_client.read(mqtt_read_address) == "42"

        mock_aiomqtt_client.publish.assert_awaited_once()
        # The device's own listener's SUBSCRIBE, and nothing for the read.
        mock_aiomqtt_client.subscribe.assert_awaited_once_with("test/topic")
        mock_aiomqtt_client.unsubscribe.assert_not_awaited()
        listener.assert_called_once_with("42")
        assert _listening(mqtt_client, "test/topic") == {listener_id}

    @pytest.mark.asyncio
    async def test_a_frame_reaches_every_listener_of_its_topic(self, mqtt_client):
        await mqtt_client.connect()
        listeners = [Mock() for _ in range(3)]
        for listener in listeners:
            await mqtt_client.register_listener(
                MqttAddress(topic="updData/AA"), listener
            )
        elsewhere = Mock()
        await mqtt_client.register_listener(MqttAddress(topic="updData/BB"), elsewhere)

        await _deliver(mqtt_client, _message("updData/AA", "42"))

        for listener in listeners:
            listener.assert_called_once_with("42")
        elsewhere.assert_not_called()


class TestWrite:
    @pytest.mark.asyncio
    async def test_write_uses_address_topic_and_message(
        self, mqtt_client, mock_aiomqtt_client, mqtt_write_address
    ):
        await mqtt_client.connect()
        await mqtt_client.write(mqtt_write_address, 42)
        mock_aiomqtt_client.publish.assert_awaited_once()
        call_kwargs = mock_aiomqtt_client.publish.call_args
        assert call_kwargs[0][0] == "test/topic/set"

    @pytest.mark.asyncio
    async def test_write_raises_when_no_message(self, mqtt_client):
        await mqtt_client.connect()
        address = MqttAddress(topic="test/topic")
        with pytest.raises(ValueError, match="no message template"):
            await mqtt_client.write(address, 42)


class TestBuildSslContext:
    def test_builds_context_with_ca_and_client_cert(self, test_pki: dict) -> None:
        context = build_ssl_context(_tls_config(test_pki, with_client_cert=True))
        assert isinstance(context, ssl.SSLContext)

    def test_ca_only_context_omits_client_cert(self, test_pki: dict) -> None:
        context = build_ssl_context(_tls_config(test_pki, with_client_cert=False))
        assert context.get_ca_certs() != []

    def test_explicit_ca_cert_skips_system_default_certs(self, test_pki: dict) -> None:
        with patch.object(ssl.SSLContext, "load_default_certs") as load_default:
            build_ssl_context(_tls_config(test_pki, with_client_cert=False))
        load_default.assert_not_called()

    def test_no_ca_cert_falls_back_to_system_default_certs(self) -> None:
        config = MqttTransportConfig(host="test.broker", tls=True)
        with patch.object(ssl.SSLContext, "load_default_certs") as load_default:
            build_ssl_context(config)
        load_default.assert_called_once()

    def test_verifies_hostname_by_default(self, test_pki: dict) -> None:
        context = build_ssl_context(_tls_config(test_pki, with_client_cert=True))
        assert context.check_hostname is True

    def test_tls_insecure_disables_hostname_verification(self, test_pki: dict) -> None:
        config = _tls_config(test_pki, with_client_cert=True).model_copy(
            update={"tls_insecure": True}
        )
        context = build_ssl_context(config)
        assert context.check_hostname is False
        # Chain validation stays on — only the hostname match is skipped.
        assert context.verify_mode == ssl.CERT_REQUIRED


class TestMtlsHandshake:
    def test_handshake_succeeds_with_matching_client_cert(self, test_pki: dict) -> None:
        client_context = build_ssl_context(_tls_config(test_pki, with_client_cert=True))
        result = _run_mtls_handshake(client_context, test_pki)
        assert "error" not in result
        assert result["peer_cert"] is not None

    def test_handshake_rejected_without_client_cert(self, test_pki: dict) -> None:
        client_context = build_ssl_context(
            _tls_config(test_pki, with_client_cert=False)
        )
        result = _run_mtls_handshake(client_context, test_pki)
        assert "error" in result or "client_error" in result
