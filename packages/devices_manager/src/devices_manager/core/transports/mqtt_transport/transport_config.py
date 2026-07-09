from typing import Annotated, Self

from pydantic import ConfigDict, Field, PositiveInt, model_validator

from devices_manager.core.transports.base_transport_config import BaseTransportConfig

MQTT_DEFAULT_PORT = 1883

PEM_FIELD = Field(default=None, json_schema_extra={"multiline": True})


class MqttTransportConfig(BaseTransportConfig):
    model_config = ConfigDict(extra="forbid", revalidate_instances="always")
    host: str
    port: PositiveInt = MQTT_DEFAULT_PORT
    tls: bool = False
    # Skip server-hostname verification, keeping certificate-chain validation
    # against the CA (equivalent to mosquitto's `--insecure`). Needed when the
    # broker's server certificate has no SAN/CN matching the connection host.
    tls_insecure: bool = False
    ca_cert: Annotated[str | None, PEM_FIELD] = None
    client_cert: Annotated[str | None, PEM_FIELD] = None
    client_key: Annotated[str | None, PEM_FIELD] = None
    username: str | None = None
    password: str | None = None

    @model_validator(mode="after")
    def _client_cert_and_key_together(self) -> Self:
        if bool(self.client_cert) != bool(self.client_key):
            msg = "client_cert and client_key must be provided together"
            raise ValueError(msg)
        return self
