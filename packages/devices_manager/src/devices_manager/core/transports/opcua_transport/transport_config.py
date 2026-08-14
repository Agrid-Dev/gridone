from typing import Annotated, Literal

from pydantic import (
    AfterValidator,
    Field,
    NonNegativeFloat,
    PositiveFloat,
    model_validator,
)

from devices_manager.core.transports.base_transport_config import BaseTransportConfig

DEFAULT_AUTH_MODE = "anonymous"
DEFAULT_CONNECT_TIMEOUT = 10.0  # seconds
DEFAULT_REQUEST_TIMEOUT = 5.0  # seconds
DEFAULT_KEEPALIVE_INTERVAL = 5.0  # seconds
DEFAULT_SAMPLING_INTERVAL_MS = 1000.0  # milliseconds — asyncua's native unit
DEFAULT_DEADBAND = 0.0  # 0 = notify on every change, no deadband filtering

ENDPOINT_URL_SCHEME = "opc.tcp://"

# OPC-UA spells the "no security" member of both enumerations "None"; it is the
# one value the two fields must agree on (a policy without a mode, or a mode
# without a policy, is not a channel any server can offer).
NO_SECURITY = "None"
DEFAULT_SECURITY_POLICY = NO_SECURITY
DEFAULT_SECURITY_MODE = NO_SECURITY

# Deprecated policies (Basic128Rsa15, Basic256) are deliberately absent: the OPC
# Foundation withdrew them, and offering them invites a downgrade.
type SecurityPolicyName = Literal[
    "None", "Basic256Sha256", "Aes128Sha256RsaOaep", "Aes256Sha256RsaPss"
]
type SecurityModeName = Literal["None", "Sign", "SignAndEncrypt"]


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
    sampling_interval_ms: PositiveFloat = DEFAULT_SAMPLING_INTERVAL_MS
    deadband: NonNegativeFloat = DEFAULT_DEADBAND
    security_policy: SecurityPolicyName = DEFAULT_SECURITY_POLICY
    security_mode: SecurityModeName = DEFAULT_SECURITY_MODE

    @property
    def secure_channel_enabled(self) -> bool:
        return self.security_policy != NO_SECURITY

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

    @model_validator(mode="after")
    def _check_security_policy_and_mode(self) -> "OpcuaTransportConfig":
        if (self.security_policy == NO_SECURITY) != (self.security_mode == NO_SECURITY):
            msg = (
                f"security_policy and security_mode must both be '{NO_SECURITY}' "
                f"or both be set"
            )
            raise ValueError(msg)
        return self
