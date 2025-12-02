import asyncio
import json
from collections import defaultdict

import aiomqtt

from core.transports import TransportClient
from core.transports.connected import connected
from core.transports.read_handler_registry import ReadHandler
from core.types import AttributeValueType, TransportProtocols
from core.utils.templating.render import render_struct

from .mqtt_address import MqttAddress
from .transport_config import MqttTransportConfig

TIMEOUT = 10


class MqttTransportClient(TransportClient[MqttAddress]):
    _client: aiomqtt.Client
    protocol = TransportProtocols.MQTT
    address_builder = MqttAddress
    config: MqttTransportConfig
    _connection_lock: asyncio.Lock
    _is_connected: bool
    _background_tasks: set
    _message_handlers: dict[
        str, set[str]
    ]  # maps topics to handler ids from handlers_registry

    def __init__(self, config: MqttTransportConfig) -> None:
        self.config = config
        self._message_handlers = defaultdict(set)
        self._background_tasks: set[asyncio.Task] = set()
        self._connection_lock = asyncio.Lock()
        self._is_connected = False
        super().__init__()

    async def connect(self) -> None:
        async with self._connection_lock:
            if not self._is_connected:
                self._client = aiomqtt.Client(self.config.host, port=self.config.port)
                await self._client.__aenter__()
                self._is_connected = True
                self._background_tasks.add(
                    asyncio.create_task(self._handle_incoming_messages())
                )

    async def close(self) -> None:
        """Disconnect from the MQTT broker."""
        if self._client:
            await self._client.__aexit__(None, None, None)
            self._is_connected = False
        for task in self._background_tasks:
            task.cancel()
        self._background_tasks.clear()

    def register_read_handler(self, address: MqttAddress, handler: ReadHandler) -> str:
        handler_id = super().register_read_handler(address, handler)
        self._message_handlers[address.topic].add(handler_id)
        task = asyncio.create_task(self._subscribe(address.topic))
        self._background_tasks.add(task)
        return handler_id

    @connected
    async def _subscribe(self, topic: str) -> None:
        await self._client.subscribe(topic)

    @connected
    async def _handle_incoming_messages(self) -> None:
        async for message in self._client.messages:
            for topic in self._message_handlers:
                if message.topic.matches(topic):
                    handler_ids = self._message_handlers[topic]
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
        await self._client.subscribe(address.topic)
        message = None

        def update_value(message_received: str) -> None:
            nonlocal message
            message = message_received

        handler_id = self.register_read_handler(address, update_value)

        payload = (
            json.dumps(address.request.message)
            if isinstance(address.request.message, dict)
            else address.request.message
        )
        await self._client.publish(
            address.request.topic,
            payload=payload,
        )
        try:
            # Wait for the first matching message within TIMEOUT
            async with asyncio.timeout(TIMEOUT):
                while True:
                    if message is not None:
                        return message
                    await asyncio.sleep(0.25)

        except TimeoutError as err:
            msg = "MQTT issue: no message received before timeout"
            raise ValueError(msg) from err
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

        await self._client.publish(address.request.topic, payload=payload)
