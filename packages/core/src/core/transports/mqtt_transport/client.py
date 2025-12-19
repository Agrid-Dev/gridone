import asyncio
import json
import logging
from collections.abc import Callable

import aiomqtt

from core.transports import TransportClient
from core.transports.connected import connected
from core.transports.read_handler_registry import ReadHandler
from core.types import AttributeValueType, TransportProtocols
from core.utils.templating.render import render_struct

from .mqtt_address import MqttAddress
from .topic_handler_registry import TopicHandlerRegistry
from .transport_config import MqttTransportConfig

TIMEOUT = 10

logger = logging.getLogger(__name__)


class MqttTransportClient(TransportClient[MqttAddress]):
    _client: aiomqtt.Client
    protocol = TransportProtocols.MQTT
    address_builder = MqttAddress
    config: MqttTransportConfig
    _background_tasks: set
    _message_handlers: (
        TopicHandlerRegistry  # maps topics to handler ids from handlers_registry
    )

    def __init__(self, config: MqttTransportConfig) -> None:
        self._message_handlers = TopicHandlerRegistry()
        self._background_tasks: set[asyncio.Task] = set()
        self._connection_lock = asyncio.Lock()
        self._is_connected = False
        super().__init__(config)

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

    @connected
    async def init_listeners(self) -> None:
        for topic in self._message_handlers.list_topics():
            await asyncio.wait_for(self._client.subscribe(topic), timeout=TIMEOUT)

    def register_read_handler(self, address: MqttAddress, handler: ReadHandler) -> str:
        handler_id = super().register_read_handler(address, handler)
        self._message_handlers.register(address.topic, handler_id)
        return handler_id

    def unregister_read_handler(
        self, handler_id: str, address: MqttAddress | None = None
    ) -> None:
        # unregister from _message handler
        topic = address.topic if address else None
        self._message_handlers.unregister(handler_id, topic)
        if topic and len(self._message_handlers.get_by_topic(topic)) == 0:
            # no other handlers on this topic, unsubscribe
            asyncio.create_task(self._unsubscribe(topic)).add_done_callback(
                lambda task: task.exception()  # Silently consume the exception
            )

        return super().unregister_read_handler(handler_id, address)

    def listen(
        self,
        topic_or_address: str | MqttAddress,
        handler: Callable[[str], None],
    ) -> str:
        """Subscribe to an MQTT topic for passive listening.

        Args:
            topic_or_address: Topic string or MqttAddress. If MqttAddress is provided,
                            only the topic field is used.
            handler: Callback function that receives the message payload as a string.

        Returns:
            Handler ID that can be used to unsubscribe via unlisten().
        """
        # Extract topic string from topic_or_address
        if isinstance(topic_or_address, MqttAddress):
            topic = topic_or_address.topic
        else:
            topic = topic_or_address

        # Register handler in the handlers registry using topic as address_id
        handler_id = self._handlers_registry.register(topic, handler)

        # Register in topic handler registry for message routing
        self._message_handlers.register(topic, handler_id)

        # Subscribe to the topic asynchronously
        task = asyncio.create_task(self._subscribe(topic))
        self._background_tasks.add(task)

        logger.debug("Subscribed to MQTT topic '%s' for passive listening", topic)
        return handler_id

    def unlisten(
        self,
        handler_id: str,
        topic_or_address: str | MqttAddress | None = None,
    ) -> None:
        """Unsubscribe from an MQTT topic and remove the handler.

        Args:
            handler_id: The handler ID returned by listen().
            topic_or_address: Optional topic string or MqttAddress. If None, the handler
                           will be looked up and removed.
        """
        # Extract topic string if provided
        topic = None
        if topic_or_address is not None:
            if isinstance(topic_or_address, MqttAddress):
                topic = topic_or_address.topic
            else:
                topic = topic_or_address

        # Unregister from topic handler registry
        self._message_handlers.unregister(handler_id, topic)

        # Unregister from handlers registry
        self._handlers_registry.remove(handler_id, topic)

        # Unsubscribe if no other handlers on this topic
        if topic and len(self._message_handlers.get_by_topic(topic)) == 0:
            asyncio.create_task(self._unsubscribe(topic)).add_done_callback(
                lambda task: task.exception()  # Silently consume the exception
            )
            logger.debug("Unsubscribed from MQTT topic '%s'", topic)
        else:
            logger.debug("Removed handler from MQTT topic '%s'", topic or "unknown")

    @connected
    async def _subscribe(self, topic: str) -> None:
        await self._client.subscribe(topic)

    @connected
    async def _unsubscribe(self, topic: str) -> None:
        await self._client.unsubscribe(topic)

    @connected
    async def _handle_incoming_messages(self) -> None:
        async for message in self._client.messages:
            handler_ids = self._message_handlers.match_topic(message.topic)
            if handler_ids:
                decoded_payload = message.payload.decode()  # ty: ignore[possibly-missing-attribute]
                for handler_id in handler_ids:
                    try:
                        handler = self._handlers_registry.get_by_id(handler_id)
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

        handler_id = self.register_read_handler(address, update_value)

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
            self.unregister_read_handler(handler_id, address)
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
