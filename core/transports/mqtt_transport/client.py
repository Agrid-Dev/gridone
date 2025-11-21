import asyncio
import json
from typing import NotRequired, TypedDict

import aiomqtt
from aiomqtt.client import ProxySettings

from core.transports import TransportClient
from core.types import AttributeValueType, TransportProtocols
from core.utils.proxy import SocksProxyConfig
from core.value_parsers import ValueParser

from .mqtt_address import MqttAddress
from .transport_config import MqttTransportConfig

TIMEOUT = 10


class _MqttWriteAddress(TypedDict, total=False):
    topic: str
    data: str
    command: NotRequired[str]


class MqttTransportClient(TransportClient):
    protocol = TransportProtocols.MQTT
    config: MqttTransportConfig

    def __init__(
        self,
        config: MqttTransportConfig,
        *,
        socks_proxy: SocksProxyConfig | None = None,
    ) -> None:
        self.config = config
        self._socks_proxy = socks_proxy
        self._client: aiomqtt.Client | None = None

    def _build_proxy_settings(self) -> ProxySettings | None:
        if not self._socks_proxy:
            return None
        try:
            import socks  # type: ignore[import-not-found]
        except ModuleNotFoundError as exc:
            msg = "PySocks is required for SOCKS proxy support in MQTT. Install it with `uv add PySocks`."
            raise RuntimeError(msg) from exc
        return ProxySettings(
            proxy_type=socks.SOCKS5,
            proxy_addr=self._socks_proxy.host,
            proxy_port=self._socks_proxy.port,
        )

    async def connect(self) -> None:
        proxy_settings = self._build_proxy_settings()
        self._client = aiomqtt.Client(
            self.config.host,
            port=self.config.port,
            proxy=proxy_settings,
        )
        await self._client.__aenter__()

    async def close(self) -> None:
        """Disconnect from the MQTT broker."""
        if self._client:
            await self._client.__aexit__(None, None, None)

    async def read(
        self,
        address: str | dict,
        value_parser: ValueParser | None = None,
        *,
        context: dict,  # noqa: ARG002
    ) -> AttributeValueType:
        if self._client is None:
            msg = "MQTT transport is not connected"
            raise RuntimeError(msg)
        mqtt_address = MqttAddress.from_raw(address)
        await self._client.subscribe(mqtt_address.topic)

        await self._client.publish(
            mqtt_address.request_read.topic,
            payload=mqtt_address.request_read.message,
        )
        try:
            # Wait for the first matching message within TIMEOUT
            async with asyncio.timeout(TIMEOUT):
                async for message in self._client.messages:
                    if message.topic.matches(mqtt_address.topic):  # noqa: SIM102
                        if value_parser:
                            try:
                                return value_parser(message.payload.decode())
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
    ) -> None:
        if self._client is None:
            msg = "MQTT transport is not connected"
            raise RuntimeError(msg)

        if not isinstance(address, dict):
            msg = "MQTT write requires a mapping with 'topic' and 'data'"
            raise ValueError(msg)

        write_address = _MqttWriteAddress(**address)  # type: ignore[arg-type]
        topic = write_address.get("topic")
        data_field = write_address.get("data")
        command = write_address.get("command", "WRITE_DATA")

        if not topic or not data_field:
            msg = "MQTT write address must include both 'topic' and 'data'"
            raise ValueError(msg)

        try:
            payload = json.dumps(
                {
                    "command": command,
                    "data": data_field,
                    "value": value,
                },
            )
        except (TypeError, ValueError) as exc:
            msg = "MQTT write value is not JSON serializable"
            raise ValueError(msg) from exc

        await self._client.publish(topic, payload=payload)
