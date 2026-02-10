from pydantic import ConfigDict, PositiveInt

from devices_manager.core.transports.base_transport_config import BaseTransportConfig


class HttpTransportConfig(BaseTransportConfig):
    model_config = ConfigDict(extra="forbid", revalidate_instances="always")
    request_timeout: PositiveInt = 10
