from collections.abc import Callable

from devices_manager.types import TransportProtocols

from .bacnet_transport import BacnetTransportClient, BacnetTransportConfig
from .base import TransportClient
from .base_transport_config import BaseTransportConfig
from .http_transport import HTTPTransportClient, HttpTransportConfig
from .modbus_tcp_transport import ModbusTCPTransportClient, ModbusTCPTransportConfig
from .mqtt_transport import MqttTransportClient, MqttTransportConfig
from .transport_metadata import TransportMetadata

type TransportClientFactory = Callable[
    [TransportProtocols, BaseTransportConfig], TransportClient
]


def make_transport_config(
    protocol: TransportProtocols, raw_config: dict | None
) -> BaseTransportConfig:
    builders = {
        TransportProtocols.HTTP: HttpTransportConfig,
        TransportProtocols.MQTT: MqttTransportConfig,
        TransportProtocols.MODBUS_TCP: ModbusTCPTransportConfig,
        TransportProtocols.BACNET: BacnetTransportConfig,
    }
    builder = builders.get(protocol)
    if not builder:
        msg = f"Protocol {protocol} not supported"
        raise ValueError(msg)
    return builder.model_validate(raw_config or {})


TRANSPORTS_BY_PROTOCOL: dict[
    TransportProtocols, tuple[type[TransportClient], type[BaseTransportConfig]]
] = {
    TransportProtocols.HTTP: (HTTPTransportClient, HttpTransportConfig),
    TransportProtocols.MQTT: (MqttTransportClient, MqttTransportConfig),
    TransportProtocols.MODBUS_TCP: (ModbusTCPTransportClient, ModbusTCPTransportConfig),
    TransportProtocols.BACNET: (BacnetTransportClient, BacnetTransportConfig),
}


def make_transport_client(
    protocol: TransportProtocols,
    config: BaseTransportConfig,
    metadata: TransportMetadata,
) -> TransportClient:
    builders = TRANSPORTS_BY_PROTOCOL.get(protocol)
    if not builders:
        msg = f"Protocol: {protocol} is not supported"
        raise ValueError(msg)
    client_class, config_class = builders
    if not isinstance(config, config_class):
        msg = f"Protocol {protocol} needs a config of type {config_class.__name__}"
        raise TypeError(msg)
    return client_class(metadata, config)
