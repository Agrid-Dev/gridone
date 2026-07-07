import socket
import ssl
import tempfile
import threading
from pathlib import Path
from unittest.mock import AsyncMock, Mock, patch

import pytest
from aiomqtt import Topic

from devices_manager.core.transports.mqtt_transport import (
    MqttAddress,
    MqttTransportClient,
    MqttTransportConfig,
)
from devices_manager.core.transports.mqtt_transport.client import build_ssl_context
from devices_manager.core.transports.mqtt_transport.mqtt_address import MqttRequest
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
    assert len(mqtt_client._background_tasks) == 1  # noqa: SLF001


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
    await mqtt_client.connect()

    mock_aiomqtt_client.__aenter__.assert_awaited_once()
    assert len(mqtt_client._background_tasks) == 1  # noqa: SLF001
    assert mqtt_client._client is mock_aiomqtt_client  # noqa: SLF001


@pytest.mark.asyncio
async def test_close(mqtt_client: MqttTransportClient, mock_aiomqtt_client: AsyncMock):
    await mqtt_client.connect()
    await mqtt_client.close()
    mock_aiomqtt_client.__aexit__.assert_awaited_once()
    assert mqtt_client.connection_state.is_connected is False
    assert len(mqtt_client._background_tasks) == 0  # noqa: SLF001


@pytest.mark.asyncio
async def test_subscribe(mqtt_client, mock_aiomqtt_client):
    await mqtt_client.connect()
    await mqtt_client._subscribe("test/topic")  # noqa: SLF001
    mock_aiomqtt_client.subscribe.assert_awaited_once_with("test/topic")


@pytest.mark.asyncio
async def test_unsubscribe(mqtt_client, mock_aiomqtt_client):
    await mqtt_client.connect()
    await mqtt_client._unsubscribe("test/topic")  # noqa: SLF001
    mock_aiomqtt_client.unsubscribe.assert_awaited_once_with("test/topic")


@pytest.mark.asyncio
async def test_unregister_last_listener_unsubscribes_synchronously(
    mqtt_client, mock_aiomqtt_client
):
    # The unsubscribe must be awaited, not fired off as a detached task:
    # a sequential re-subscribe on the same topic would otherwise race it.
    await mqtt_client.connect()
    listener_id = await mqtt_client.register_listener("test/topic", Mock())
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
    await mqtt_client.register_listener(mqtt_read_address.topic, callback)

    mock_aiomqtt_client.messages = AsyncIteratorMock([mock_message])
    await mqtt_client._handle_incoming_messages()  # noqa: SLF001

    callback.assert_called_once_with('{"value": 42}')


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

        async def register_and_deliver(topic, callback):  # noqa: ANN202
            listener_id = await original_register(topic, callback)
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

        async def register_and_deliver(topic, callback):  # noqa: ANN202
            listener_id = await original_register(topic, callback)
            callback("pushed_value")
            return listener_id

        mqtt_client.register_listener = register_and_deliver

        result = await mqtt_client.read(mqtt_listen_address)
        assert result == "pushed_value"
        mock_aiomqtt_client.publish.assert_not_awaited()


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
