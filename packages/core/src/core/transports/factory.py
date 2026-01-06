from collections.abc import Callable
from typing import Annotated, Literal

from pydantic import BaseModel, Field, TypeAdapter

from core.types import TransportProtocols

from .bacnet_transport import BacnetTransportClient, BacnetTransportConfig
from .base import TransportClient
from .base_transport_config import BaseTransportConfig
from .http_transport import HTTPTransportClient, HttpTransportConfig
from .modbus_tcp_transport import ModbusTCPTransportClient, ModbusTCPTransportConfig
from .mqtt_transport import MqttTransportClient, MqttTransportConfig


class HttpTransport(BaseModel):
    protocol: Literal[TransportProtocols.HTTP]
    config: HttpTransportConfig


class MqttTransport(BaseModel):
    protocol: Literal[TransportProtocols.MQTT]
    config: MqttTransportConfig


class ModbusTcpTransport(BaseModel):
    protocol: Literal[TransportProtocols.MODBUS_TCP]
    config: ModbusTCPTransportConfig


class BacnetTransport(BaseModel):
    protocol: Literal[TransportProtocols.BACNET]
    config: BacnetTransportConfig


Transport = Annotated[
    HttpTransport | MqttTransport | ModbusTcpTransport | BacnetTransport,
    Field(discriminator="protocol"),
]


def parse_transport(raw: dict) -> Transport:
    return TypeAdapter(Transport).validate_python(raw)


type TransportConfigFactory = Callable[[TransportProtocols, dict], BaseTransportConfig]


type TransportClientFactory = Callable[[Transport], TransportClient]


def make_transport_client(transport: Transport) -> TransportClient:
    match transport:
        case HttpTransport():
            return HTTPTransportClient(transport.config)
        case MqttTransport():
            return MqttTransportClient(transport.config)
        case ModbusTcpTransport():
            return ModbusTCPTransportClient(transport.config)
        case BacnetTransport():
            return BacnetTransportClient(transport.config)
    msg = "Could not match transport"
    raise ValueError(msg)
