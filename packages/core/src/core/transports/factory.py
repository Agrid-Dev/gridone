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
    Transport,
)


def parse_transport(raw: dict) -> Transport:
    return TypeAdapter(Transport).validate_python(raw)


type TransportConfigFactory = Callable[[TransportProtocols, dict], BaseTransportConfig]


type TransportClientFactory = Callable[[Transport], TransportClient]


def make_transport_client(transport: Transport) -> TransportClient:
    match transport.protocol:
        case TransportProtocols.HTTP:
            return HTTPTransportClient(transport.config)  # ty:ignore[invalid-argument-type]
        case TransportProtocols.MQTT:
            return MqttTransportClient(transport.config)  # ty:ignore[invalid-argument-type]
        case TransportProtocols.MODBUS_TCP:
            return ModbusTCPTransportClient(transport.config)  # ty:ignore[invalid-argument-type]
        case TransportProtocols.BACNET:
            return BacnetTransportClient(transport.config)  # ty:ignore[invalid-argument-type]
    msg = f"Invalid protocol: {transport.protocol}"
    raise ValueError(msg)
