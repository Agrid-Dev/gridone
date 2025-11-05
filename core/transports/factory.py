from core.types import TransportProtocols

from .base import TransportClient
from .http import HTTPTransportClient


def get_transport_client(transport: TransportProtocols) -> TransportClient:
    if transport == TransportProtocols.HTTP:
        return HTTPTransportClient()
    msg = f"Transport client for protocol '{transport}' is not implemented"
    raise NotImplementedError(
        msg,
    )
