from collections.abc import Callable

from core.types import TransportProtocols

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


def make_transport_client(
    protocol: TransportProtocols,
    config: BaseTransportConfig,
    metadata: TransportMetadata,
) -> TransportClient:
    if protocol == TransportProtocols.HTTP:
        if not isinstance(config, HttpTransportConfig):
            msg = f"{protocol} requires HttpTransportConfig but have {type(config)}"
            raise ValueError(msg)
        return HTTPTransportClient(metadata, config)
    if protocol == TransportProtocols.MQTT:
        if not isinstance(config, MqttTransportConfig):
            msg = f"{protocol} requires MqttTransportConfig but have {type(config)}"
            raise ValueError(msg)
        return MqttTransportClient(metadata, config)

    if protocol == TransportProtocols.MODBUS_TCP:
        if not isinstance(config, ModbusTCPTransportConfig):
            msg = (
                f"{protocol} requires ModbusTCPTransportConfig but have {type(config)}"
            )
            raise ValueError(msg)
        return ModbusTCPTransportClient(metadata, config)

    if protocol == TransportProtocols.BACNET:
        if not isinstance(config, BacnetTransportConfig):
            msg = f"{protocol} requires BacnetTransportConfig but have {type(config)}"
            raise ValueError(msg)
        return BacnetTransportClient(metadata, config)

    msg = f"Invalid protocol: {protocol}"
    raise ValueError(msg)
