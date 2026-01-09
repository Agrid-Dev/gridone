import asyncio
import json
import logging

import aiomqtt

from core.transports import PushTransportClient
from core.transports.connected import connected
from core.transports.listener_registry import ListenerCallback, ListenerRegistry
from core.transports.transport_metadata import TransportMetadata
from core.types import AttributeValueType, TransportProtocols
from core.utils.templating.render import render_struct

from .mqtt_address import MqttAddress
from .topic_handler_registry import TopicHandlerRegistry
from .transport_config import MqttTransportConfig

TIMEOUT = 10

logger = logging.getLogger(__name__)


class MqttTransportClient(PushTransportClient[MqttAddress]):
    _client: aiomqtt.Client
    protocol = TransportProtocols.MQTT
    address_builder = MqttAddress
    config: MqttTransportConfig
    _handlers_registry: ListenerRegistry
    _background_tasks: set
    _message_handlers: (
        TopicHandlerRegistry  # maps topics to handler ids from handlers_registry
    )

    def __init__(
        self, metadata: TransportMetadata, config: MqttTransportConfig
    ) -> None:
        self._message_handlers = TopicHandlerRegistry()
        self._background_tasks: set[asyncio.Task] = set()
        self._connection_lock = asyncio.Lock()
        self._is_connected = False
        self._handlers_registry = ListenerRegistry()
        super().__init__(metadata, config)

    async def connect(self) -> None:
        async with self._connection_lock:
            if not self._is_connected:
                self._client = aiomqtt.Client(self.config.host, port=self.config.port)
                await asyncio.wait_for(self._client.__aenter__(), timeout=TIMEOUT)
                self._background_tasks.add(
                    asyncio.create_task(self._handle_incoming_messages())
                )
                await super().connect()

    async def close(self) -> None:
        """Disconnect from the MQTT broker."""
        async with self._connection_lock:
            if self._client:
                await self._client.__aexit__(None, None, None)
                self._is_connected = False
            for task in self._background_tasks:
                task.cancel()
            self._background_tasks.clear()
            await super().close()

    async def register_listener(self, topic: str, callback: ListenerCallback) -> str:
        listener_id = self._handlers_registry.register(topic, callback)
        await self._subscribe(topic)
        self._message_handlers.register(topic, listener_id)
        logger.debug("New listener registered on topic %s", topic)
        return listener_id

    async def unregister_listener(
        self, callback_id: str, topic: str | None = None
    ) -> None:
        # unregister from _message handler
        self._message_handlers.unregister(callback_id, topic)
        if topic and len(self._message_handlers.get_by_topic(topic)) == 0:
            # no other handlers on this topic, unsubscribe
            asyncio.create_task(self._unsubscribe(topic)).add_done_callback(
                lambda task: task.exception()  # Silently consume the exception
            )

    @connected
    async def _subscribe(self, topic: str) -> None:
        await self._client.subscribe(topic)

    @connected
    async def _unsubscribe(self, topic: str) -> None:
        await self._client.unsubscribe(topic)

    @connected
    async def _handle_incoming_messages(self) -> None:
        async for message in self._client.messages:
            callback_ids = self._message_handlers.match_topic(message.topic)
            logger.debug(
                "Handling new message on topic %s %s callbacks found",
                message.topic,
                len(callback_ids),
            )
            if callback_ids:
                decoded_payload = message.payload.decode()  # ty: ignore[possibly-missing-attribute]
                for callback_id in callback_ids:
                    try:
                        handler = self._handlers_registry.get_by_id(callback_id)
                        handler(decoded_payload)
                    except Exception:  # noqa: BLE001, S110
                        pass

    @connected
    async def read(
        self,
        address: MqttAddress,
    ) -> AttributeValueType:
        message = None
        message_event = asyncio.Event()
        await self._subscribe(address.topic)

        def update_value(message_received: str) -> None:
            nonlocal message
            nonlocal message_event
            message = message_received
            message_event.set()

        listener_id = await self.register_listener(address.topic, update_value)

        payload = (
            json.dumps(address.request.message)
            if isinstance(address.request.message, dict)
            else address.request.message
        )
        await self._client.publish(
            address.request.topic, payload=payload, timeout=TIMEOUT
        )
        try:
            async with asyncio.timeout(TIMEOUT):
                await message_event.wait()
                if message is not None:
                    return message
        except TimeoutError as err:
            msg = "MQTT issue: no message received before timeout"
            raise TimeoutError(msg) from err
        finally:
            await self.unregister_listener(listener_id, address.topic)
        msg = "Unable to read value"
        raise ValueError(msg)

    @connected
    async def write(self, address: MqttAddress, value: AttributeValueType) -> None:
        message_template = address.request.message
        message = render_struct(
            message_template,
            {
                "value": json.dumps(value)
                if isinstance(message_template, str)
                else value
            },
        )
        payload = json.dumps(message) if isinstance(message, dict) else message

        await self._client.publish(
            address.request.topic, payload=payload, timeout=TIMEOUT
        )
