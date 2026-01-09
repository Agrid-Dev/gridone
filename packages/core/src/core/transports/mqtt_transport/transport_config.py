from pydantic import ConfigDict, PositiveInt

from core.transports.base_transport_config import BaseTransportConfig

MQTT_DEFAULT_PORT = 1883


class MqttTransportConfig(BaseTransportConfig):
    model_config = ConfigDict(extra="forbid", revalidate_instances="always")
    host: str
    port: PositiveInt = MQTT_DEFAULT_PORT
