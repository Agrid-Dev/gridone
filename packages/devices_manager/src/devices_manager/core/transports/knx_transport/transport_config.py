from typing import Annotated, Literal, Self

from pydantic import ConfigDict, Field, PositiveInt, model_validator
from xknx.io import ConnectionConfig, ConnectionType
from xknx.io.connection import SecureConfig

from devices_manager.core.transports.base_transport_config import (
    HOST_PATTERN,
    BaseTransportConfig,
)

KNX_DEFAULT_PORT = 3671


class KNXTransportConfig(BaseTransportConfig):
    model_config = ConfigDict(extra="forbid", revalidate_instances="always")
    gateway_ip: Annotated[
        str,
        Field(
            min_length=1,
            pattern=HOST_PATTERN,
            description="KNX/IP gateway host or IP (no protocol prefix)",
        ),
    ]
    port: PositiveInt = KNX_DEFAULT_PORT
    tunneling_mode: Literal["udp", "tcp"] = "udp"
    # IP-Secure credentials, flat (the form-schema dialect has no nested
    # objects): both passwords set enables KNX IP-Secure, both unset disables
    # it — one without the other is a config error.
    secure_device_authentication_password: Annotated[
        str | None,
        Field(
            description=(
                "KNX IP-Secure device authentication password "
                "(set together with the secure user password)"
            ),
        ),
    ] = None
    secure_user_password: Annotated[
        str | None,
        Field(
            description=(
                "KNX IP-Secure user password "
                "(set together with the secure device authentication password)"
            ),
        ),
    ] = None
    secure_user_id: Annotated[
        PositiveInt,
        Field(description="KNX IP-Secure tunnel user ID"),
    ] = 2

    @model_validator(mode="after")
    def _secure_passwords_come_in_pairs(self) -> Self:
        if (self.secure_device_authentication_password is None) != (
            self.secure_user_password is None
        ):
            msg = (
                "secure_device_authentication_password and secure_user_password "
                "must be set together to enable KNX IP-Secure"
            )
            raise ValueError(msg)
        return self

    def _tunneling_connection_type_and_secure(
        self,
    ) -> tuple[ConnectionType, SecureConfig | None]:
        if (
            self.secure_device_authentication_password is not None
            and self.secure_user_password is not None
        ):
            return (
                ConnectionType.TUNNELING_TCP_SECURE,
                SecureConfig(
                    device_authentication_password=(
                        self.secure_device_authentication_password
                    ),
                    user_password=self.secure_user_password,
                    user_id=int(self.secure_user_id),
                ),
            )
        if self.tunneling_mode == "tcp":
            return ConnectionType.TUNNELING_TCP, None
        return ConnectionType.TUNNELING, None

    def to_xknx_connection_config(self) -> ConnectionConfig:
        """Build xknx ConnectionConfig; route_back=True handles NAT/Docker UDP."""
        connection_type, secure_config = self._tunneling_connection_type_and_secure()
        return ConnectionConfig(
            connection_type=connection_type,
            gateway_ip=self.gateway_ip,
            gateway_port=int(self.port),
            secure_config=secure_config,
            auto_reconnect=False,
            route_back=self.tunneling_mode == "udp",
        )
