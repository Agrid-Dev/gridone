from typing import Annotated, Literal

from pydantic import BaseModel, ConfigDict, Field, PositiveInt
from xknx.io import ConnectionConfig, ConnectionType
from xknx.io.connection import SecureConfig

from devices_manager.core.transports.base_transport_config import (
    HOST_PATTERN,
    BaseTransportConfig,
)

KNX_DEFAULT_PORT = 3671


class KNXSecureCredentials(BaseModel):
    model_config = ConfigDict(extra="forbid", revalidate_instances="always")
    device_authentication_password: str
    user_password: str
    user_id: PositiveInt = 2

    def to_xknx_secure_config(self) -> SecureConfig:
        return SecureConfig(
            device_authentication_password=self.device_authentication_password,
            user_password=self.user_password,
            user_id=int(self.user_id),
        )


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
    secure_credentials: KNXSecureCredentials | None = None

    def _tunneling_connection_type_and_secure(
        self,
    ) -> tuple[ConnectionType, SecureConfig | None]:
        if self.secure_credentials is not None:
            return (
                ConnectionType.TUNNELING_TCP_SECURE,
                self.secure_credentials.to_xknx_secure_config(),
            )
        if self.tunneling_mode == "tcp":
            return ConnectionType.TUNNELING_TCP, None
        return ConnectionType.TUNNELING, None

    def to_xknx_connection_config(self) -> ConnectionConfig:
        """UDP tunnel, plain TCP tunnel, or TCP + IP Secure (if credentials set)."""
        connection_type, secure_config = self._tunneling_connection_type_and_secure()
        return ConnectionConfig(
            connection_type=connection_type,
            gateway_ip=self.gateway_ip,
            gateway_port=int(self.port),
            secure_config=secure_config,
            auto_reconnect=False,
        )
