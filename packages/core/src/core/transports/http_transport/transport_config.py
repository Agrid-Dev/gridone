from pydantic import PositiveInt

from core.transports.transport_config import TransportConfig


class HttpTransportConfig(TransportConfig):
    request_timeout: PositiveInt = 10
