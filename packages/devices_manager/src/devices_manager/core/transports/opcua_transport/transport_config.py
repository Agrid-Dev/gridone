from typing import Annotated, Literal

from pydantic import AfterValidator, Field, PositiveFloat, model_validator

from devices_manager.core.transports.base_transport_config import BaseTransportConfig

DEFAULT_AUTH_MODE = "anonymous"
DEFAULT_CONNECT_TIMEOUT = 10.0  # seconds
DEFAULT_REQUEST_TIMEOUT = 5.0  # seconds
DEFAULT_KEEPALIVE_INTERVAL = 5.0  # seconds

ENDPOINT_URL_SCHEME = "opc.tcp://"


def validate_endpoint_url(v: str) -> str:
    if not v.startswith(ENDPOINT_URL_SCHEME):
        msg = (
            f"Invalid OPC-UA endpoint URL, must start with '{ENDPOINT_URL_SCHEME}': {v}"
        )
        raise ValueError(msg)
    return v


class OpcuaTransportConfig(BaseTransportConfig):
    endpoint_url: Annotated[str, AfterValidator(validate_endpoint_url)]
    auth_mode: Literal["anonymous", "username_password"] = DEFAULT_AUTH_MODE
    username: str | None = None
    password: Annotated[str | None, Field(json_schema_extra={"secret": True})] = None
    connect_timeout: PositiveFloat = DEFAULT_CONNECT_TIMEOUT
    request_timeout: PositiveFloat = DEFAULT_REQUEST_TIMEOUT
    keepalive_interval: PositiveFloat = DEFAULT_KEEPALIVE_INTERVAL

    @model_validator(mode="after")
    def _check_username_password(self) -> "OpcuaTransportConfig":
        needs_credentials = self.auth_mode == "username_password"
        if needs_credentials and not (self.username and self.password):
            msg = (
                "username and password are required when auth_mode is "
                "'username_password'"
            )
            raise ValueError(msg)
        return self
