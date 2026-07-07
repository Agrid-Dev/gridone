from typing import Annotated

from pydantic import ConfigDict, Field, PositiveInt

from devices_manager.core.transports.base_transport_config import BaseTransportConfig

MQTT_DEFAULT_PORT = 1883

SECRET_FIELD = Field(default=None, json_schema_extra={"secret": True})


class MqttTransportConfig(BaseTransportConfig):
    model_config = ConfigDict(extra="forbid", revalidate_instances="always")
    host: str
    port: PositiveInt = MQTT_DEFAULT_PORT
    tls: bool = False
    ca_cert: str | None = None
    client_cert: str | None = None
    client_key: Annotated[str | None, SECRET_FIELD] = None
    username: str | None = None
    password: Annotated[str | None, SECRET_FIELD] = None
