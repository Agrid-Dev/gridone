import asyncio
import json

import aiomqtt

from core.transports import TransportClient
from core.types import AttributeValueType, TransportProtocols
from core.utils.templating.render import render_struct
from core.value_parsers import ValueParser

from .mqtt_address import MqttAddress
from .transport_config import MqttTransportConfig

TIMEOUT = 10


class MqttTransportClient(TransportClient):
    _client: aiomqtt.Client
    protocol = TransportProtocols.MQTT
    config: MqttTransportConfig

    def __init__(self, config: MqttTransportConfig) -> None:
        self.config = config

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
        address: str | dict,
        value_parser: ValueParser,
        *,
        context: dict,  # noqa: ARG002
    ) -> AttributeValueType:
        mqtt_address = MqttAddress.from_raw(address)
        await self._client.subscribe(mqtt_address.topic)

        payload = (
            json.dumps(mqtt_address.request.message)
            if isinstance(mqtt_address.request.message, dict)
            else mqtt_address.request.message
        )
        await self._client.publish(
            mqtt_address.request.topic,
            payload=payload,
        )
        try:
            # Wait for the first matching message within TIMEOUT
            async with asyncio.timeout(TIMEOUT):
                async for message in self._client.messages:
                    if message.topic.matches(mqtt_address.topic):
                        try:
                            return value_parser.parse(message.payload.decode())  # ty: ignore[possibly-missing-attribute]
                        except ValueError:
                            continue  # Not the message we expect → keep listening

        except TimeoutError as err:
            msg = "MQTT issue: no message received before timeout"
            raise ValueError(msg) from err
        msg = "Unable to read value"
        raise ValueError(msg)

    async def write(
        self,
        address: str | dict,
        value: AttributeValueType,
        *,
        context: dict,  # noqa: ARG002
        value_parser: ValueParser,  # noqa: ARG002
    ) -> None:
        if self._client is None:
            msg = "MQTT transport is not connected"
            raise RuntimeError(msg)

        write_address = MqttAddress.from_raw(address)
        message_template = write_address.request.message
        message = render_struct(
            message_template,
            {"value": json.dumps(value) if isinstance(message_template, str) else value},
        )
        payload = json.dumps(message) if isinstance(message, dict) else message

        await self._client.publish(write_address.request.topic, payload=payload)
