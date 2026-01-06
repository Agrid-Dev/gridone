from collections.abc import Callable

from pydantic import TypeAdapter

from core.types import TransportProtocols

from .bacnet_transport import BacnetTransportClient
from .base import TransportClient
from .base_transport_config import BaseTransportConfig
from .http_transport import HTTPTransportClient
from .modbus_tcp_transport import ModbusTCPTransportClient
from .mqtt_transport import MqttTransportClient
from .transport import (
    BacnetTransport,
    HttpTransport,
    ModbusTcpTransport,
    MqttTransport,
    Transport,
)


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
