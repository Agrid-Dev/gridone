from pydantic import PositiveInt

from core.transports.base_transport_config import BaseTransportConfig

MQTT_DEFAULT_PORT = 1883


class MqttTransportConfig(BaseTransportConfig):
    host: str
    port: PositiveInt = MQTT_DEFAULT_PORT
