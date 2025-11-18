from pydantic import BaseModel, PositiveInt

MQTT_DEFAULT_PORT = 1883


class MqttTransportConfig(BaseModel):
    host: str
    port: PositiveInt = 1883
