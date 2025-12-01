import asyncio
import json

import aiomqtt

from core.transports import TransportClient
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

    def __init__(self, config: MqttTransportConfig) -> None:
        self.config = config
        super().__init__()

    async def connect(self) -> None:
        self._client = aiomqtt.Client(
            self.config.host,
            port=self.config.port,
        )
        await self._client.__aenter__()

    async def close(self) -> None:
        """Disconnect from the MQTT broker."""
        if self._client:
            await self._client.__aexit__(None, None, None)

    async def read(
        self,
        address: MqttAddress,
    ) -> AttributeValueType:
        await self._client.subscribe(address.topic)

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
                async for message in self._client.messages:
                    if message.topic.matches(address.topic):
                        return message.payload.decode()  # ty: ignore[ possibly-missing-attribute]

        except TimeoutError as err:
            msg = "MQTT issue: no message received before timeout"
            raise ValueError(msg) from err
        msg = "Unable to read value"
        raise ValueError(msg)

    async def write(self, address: MqttAddress, value: AttributeValueType) -> None:
        if self._client is None:
            msg = "MQTT transport is not connected"
            raise RuntimeError(msg)

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
