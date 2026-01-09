from pydantic import PositiveInt

from core.transports.base_transport_config import BaseTransportConfig


class HttpTransportConfig(BaseTransportConfig):
    request_timeout: PositiveInt = 10
