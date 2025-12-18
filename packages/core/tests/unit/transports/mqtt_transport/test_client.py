from unittest.mock import AsyncMock, Mock, patch

import pytest
from aiomqtt import Topic
from core.transports.mqtt_transport import (
    MqttAddress,
    MqttTransportClient,
    MqttTransportConfig,
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
def mqtt_client(mock_config: MqttTransportConfig, mock_aiomqtt_client: AsyncMock):  # noqa: ARG001
    return MqttTransportClient(mock_config)


@pytest.mark.asyncio
async def test_connect_success(
    mqtt_client: MqttTransportClient,
    mock_aiomqtt_client: AsyncMock,
):
    assert mqtt_client._is_connected is False
    await mqtt_client.connect()
    assert mqtt_client._is_connected is True
    mock_aiomqtt_client.__aenter__.assert_awaited_once()
    assert len(mqtt_client._background_tasks) == 1  # _handle_incoming_messages task


@pytest.mark.asyncio
async def test_close(mqtt_client: MqttTransportClient, mock_aiomqtt_client: AsyncMock):
    await mqtt_client.connect()
    await mqtt_client.close()
    mock_aiomqtt_client.__aexit__.assert_awaited_once()
    assert mqtt_client._is_connected is False
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


@pytest.fixture
def mqtt_address() -> MqttAddress:
    address_dict = {
        "topic": "test/topic",
        "request": {"topic": "test/topic", "message": "test_message"},
    }
    return MqttAddress(**address_dict)  # ty:ignore[invalid-argument-type]


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


@pytest.mark.asyncio
async def test_handle_incoming_messages(mqtt_client, mock_aiomqtt_client, mqtt_address):
    # Mock a message
    mock_message = AsyncMock()
    mock_message.topic = Topic("test/topic")
    mock_message.payload = b'{"value": 42}'

    # Register a handler
    handler = Mock()
    mqtt_client.register_read_handler(mqtt_address, handler)

    mock_aiomqtt_client.messages = AsyncIteratorMock([mock_message])
    await mqtt_client._handle_incoming_messages()

    # Verify the handler was called
    handler.assert_called_once_with('{"value": 42}')
