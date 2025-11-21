from core.types import TransportProtocols
from core.utils.proxy import SocksProxyConfig

from .base import TransportClient
from .http_transport import HTTPTransportClient
from .modbus_tcp_transport import ModbusTCPTransportClient, ModbusTCPTransportConfig
from .mqtt_transport import MqttTransportClient, MqttTransportConfig


def get_transport_client(
    transport: TransportProtocols,
    config: dict,
    *,
    socks_proxy: SocksProxyConfig | None = None,
) -> TransportClient:
    if transport == TransportProtocols.HTTP:
        return HTTPTransportClient(socks_proxy=socks_proxy)
    if transport == TransportProtocols.MODBUS_TCP:
        return ModbusTCPTransportClient(ModbusTCPTransportConfig(**config))
    if transport == TransportProtocols.MQTT:
        return MqttTransportClient(MqttTransportConfig(**config))
    msg = f"Transport client for protocol '{transport}' is not implemented"
    raise NotImplementedError(
        msg,
    )
