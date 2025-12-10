from collections.abc import Callable

from pydantic import ValidationError

from core.types import TransportProtocols

from .bacnet_transport import BacnetTransportClient, BacnetTransportConfig
from .base import TransportClient
from .http_transport import HTTPTransportClient, HttpTransportConfig
from .modbus_tcp_transport import ModbusTCPTransportClient, ModbusTCPTransportConfig
from .mqtt_transport import MqttTransportClient, MqttTransportConfig
from .transport_config import TransportConfig

config_builders: dict[TransportProtocols, type[TransportConfig]] = {
    TransportProtocols.HTTP: HttpTransportConfig,
    TransportProtocols.MQTT: MqttTransportConfig,
    TransportProtocols.MODBUS_TCP: ModbusTCPTransportConfig,
    TransportProtocols.BACNET: BacnetTransportConfig,
}

client_builders: dict[TransportProtocols, type[TransportClient]] = {
    TransportProtocols.HTTP: HTTPTransportClient,
    TransportProtocols.MQTT: MqttTransportClient,
    TransportProtocols.MODBUS_TCP: ModbusTCPTransportClient,
    TransportProtocols.BACNET: BacnetTransportClient,
}

type TransportConfigFactory = Callable[[TransportProtocols, dict], TransportConfig]


def make_transport_config(
    protocol: TransportProtocols, raw_config: dict
) -> TransportConfig:
    try:
        return config_builders[protocol](**raw_config)
    except KeyError as e:
        msg = f"Transport Config not implemented for {protocol}"
        raise ValueError(msg) from e
    except ValidationError as e:
        msg = f"Invalid transport config for {protocol}"
        raise ValueError(msg) from e


type TransportClientFactory = Callable[
    [TransportProtocols, TransportConfig], TransportClient
]


def make_transport_client(
    protocol: TransportProtocols,
    transport_config: TransportConfig,
) -> TransportClient:
    try:
        return client_builders[protocol](transport_config)
    except KeyError as e:
        msg = f"Transport not implemented for {protocol}"
        raise ValueError(msg) from e
    except ValidationError as e:
        msg = f"Invalid transport config for {protocol}"
        raise ValueError(msg) from e
