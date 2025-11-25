from core.types import TransportProtocols

from .bacnet_transport import BacnetTransportClient, BacnetTransportConfig
from .base import TransportClient
from .http_transport import HTTPTransportClient
from .modbus_tcp_transport import ModbusTCPTransportClient, ModbusTCPTransportConfig
from .mqtt_transport import MqttTransportClient, MqttTransportConfig


def get_transport_client(
    transport: TransportProtocols,
    config: dict,
) -> TransportClient:
    if transport == TransportProtocols.HTTP:
        return HTTPTransportClient()
    if transport == TransportProtocols.MODBUS_TCP:
        return ModbusTCPTransportClient(ModbusTCPTransportConfig(**config))
    if transport == TransportProtocols.MQTT:
        return MqttTransportClient(MqttTransportConfig(**config))
    if transport == TransportProtocols.BACNET:
        return BacnetTransportClient(BacnetTransportConfig(**config))
    msg = f"Transport client for protocol '{transport}' is not implemented"
    raise NotImplementedError(
        msg,
    )
