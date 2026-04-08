from unittest.mock import AsyncMock, Mock, patch

import pytest
from aiomqtt import Topic

from devices_manager.core.transports.mqtt_transport import (
    MqttAddress,
    MqttTransportClient,
    MqttTransportConfig,
)
from devices_manager.core.transports.mqtt_transport.mqtt_address import MqttRequest
from devices_manager.core.transports.transport_metadata import TransportMetadata


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
    assert len(mqtt_client._background_tasks) == 1  # _handle_incoming_messages task


@pytest.mark.asyncio
async def test_close(mqtt_client: MqttTransportClient, mock_aiomqtt_client: AsyncMock):
    await mqtt_client.connect()
    await mqtt_client.close()
    mock_aiomqtt_client.__aexit__.assert_awaited_once()
    assert mqtt_client.connection_state.is_connected is False
    assert len(mqtt_client._background_tasks) == 0


@pytest.mark.asyncio
async def test_subscribe(mqtt_client, mock_aiomqtt_client):
    await mqtt_client.connect()
    await mqtt_client._subscribe("test/topic")
    mock_aiomqtt_client.subscribe.assert_awaited_once_with("test/topic")


@pytest.mark.asyncio
async def test_unsubscribe(mqtt_client, mock_aiomqtt_client):
    await mqtt_client.connect()
    await mqtt_client._unsubscribe("test/topic")
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
    await mqtt_client._handle_incoming_messages()

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
