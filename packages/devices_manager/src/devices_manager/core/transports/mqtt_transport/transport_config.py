from typing import Self

from pydantic import ConfigDict, PositiveInt, model_validator

from devices_manager.core.transports.base_transport_config import BaseTransportConfig

MQTT_DEFAULT_PORT = 1883


class MqttTransportConfig(BaseTransportConfig):
    model_config = ConfigDict(extra="forbid", revalidate_instances="always")
    host: str
    port: PositiveInt = MQTT_DEFAULT_PORT
    tls: bool = False
    ca_cert: str | None = None
    client_cert: str | None = None
    client_key: str | None = None
    username: str | None = None
    password: str | None = None

    @model_validator(mode="after")
    def _client_cert_and_key_together(self) -> Self:
        if bool(self.client_cert) != bool(self.client_key):
            msg = "client_cert and client_key must be provided together"
            raise ValueError(msg)
        return self
