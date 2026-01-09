from pydantic import ConfigDict, PositiveInt

from core.transports.base_transport_config import BaseTransportConfig


class HttpTransportConfig(BaseTransportConfig):
    model_config = ConfigDict(extra="forbid", revalidate_instances="always")
    request_timeout: PositiveInt = 10
