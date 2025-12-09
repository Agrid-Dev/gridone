from pydantic import PositiveInt

from core.transports.transport_config import TransportConfig

MQTT_DEFAULT_PORT = 1883


class MqttTransportConfig(TransportConfig):
    host: str
    port: PositiveInt = MQTT_DEFAULT_PORT
