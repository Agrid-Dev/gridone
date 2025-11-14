from core.types import TransportProtocols

from .base import TransportClient
from .http_transport import HTTPTransportClient
from .modbus_tcp_transport import ModbusTCPTransportClient, ModbusTCPTransportConfig


def get_transport_client(
    transport: TransportProtocols,
    config: dict,
) -> TransportClient:
    if transport == TransportProtocols.HTTP:
        return HTTPTransportClient()
    if transport == TransportProtocols.MODBUS_TCP:
        return ModbusTCPTransportClient(ModbusTCPTransportConfig(**config))
    msg = f"Transport client for protocol '{transport}' is not implemented"
    raise NotImplementedError(
        msg,
    )
