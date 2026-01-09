from typing import Annotated, Literal

from core.transports import (
    BaseTransportConfig,
    TransportClient,
    TransportMetadata,
    make_transport_client,
)
from core.transports.bacnet_transport import (
    BacnetTransportConfig,
)
from core.transports.factory import make_transport_config
from core.transports.http_transport import HttpTransportConfig
from core.transports.modbus_tcp_transport import (
    ModbusTCPTransportConfig,
)
from core.transports.mqtt_transport import MqttTransportConfig
from core.types import TransportProtocols
from pydantic import BaseModel, Field, ValidationInfo, field_validator


class TransportBaseDTO(BaseModel):
    id: str
    name: str


class HttpTransportDTO(TransportBaseDTO):
    protocol: Literal[TransportProtocols.HTTP]
    config: HttpTransportConfig


class MqttTransportDTO(TransportBaseDTO):
    protocol: Literal[TransportProtocols.MQTT]
    config: MqttTransportConfig


class ModbusTcpTransportDTO(TransportBaseDTO):
    protocol: Literal[TransportProtocols.MODBUS_TCP]
    config: ModbusTCPTransportConfig


class BacnetTransportDTO(TransportBaseDTO):
    protocol: Literal[TransportProtocols.BACNET]
    config: BacnetTransportConfig


TransportDTO = Annotated[
    HttpTransportDTO | MqttTransportDTO | ModbusTcpTransportDTO | BacnetTransportDTO,
    Field(discriminator="protocol"),
]


def dto_to_core(dto: TransportDTO) -> TransportClient:
    return make_transport_client(
        dto.protocol,
        dto.config,
        TransportMetadata(
            id=dto.id,
            name=dto.name,
        ),
    )


DTO_BY_PROTOCOL = {
    TransportProtocols.HTTP: HttpTransportDTO,
    TransportProtocols.MQTT: MqttTransportDTO,
    TransportProtocols.MODBUS_TCP: ModbusTcpTransportDTO,
    TransportProtocols.BACNET: BacnetTransportDTO,
}


def build_dto(
    transport_id: str,
    name: str,
    protocol: TransportProtocols,
    config: BaseTransportConfig | dict,
) -> TransportDTO:
    dto_class = DTO_BY_PROTOCOL.get(protocol)
    if not dto_class:
        msg = (
            "Transport client did not match any supported client, cannot convert to dto"
        )
        raise ValueError(msg)
    if not isinstance(config, BaseTransportConfig):
        config = make_transport_config(protocol, config)
    return dto_class(
        id=transport_id,
        name=name,
        protocol=protocol,
        config=config,
    )


def core_to_dto(client: TransportClient) -> TransportDTO:
    return build_dto(
        client.metadata.id, client.metadata.name, client.protocol, client.config
    )


CONFIG_CLASS_BY_PROTOCOL: dict[TransportProtocols, type[BaseTransportConfig]] = {
    TransportProtocols.HTTP: HttpTransportConfig,
    TransportProtocols.MQTT: MqttTransportConfig,
    TransportProtocols.MODBUS_TCP: ModbusTCPTransportConfig,
    TransportProtocols.BACNET: BacnetTransportConfig,
}


class TransportCreateDTO(BaseModel):
    name: str
    protocol: TransportProtocols
    # After validation this will *always* be a BaseTransportConfig subclass instance
    config: BaseTransportConfig

    @field_validator("config", mode="before")
    @classmethod
    def validate_and_build_config(
        cls,
        v: dict | BaseTransportConfig,
        info: ValidationInfo,
    ) -> BaseTransportConfig:
        protocol = info.data.get("protocol")
        if protocol is None:
            msg = "protocol must be set before config"
            raise ValueError(msg)

        config_cls = CONFIG_CLASS_BY_PROTOCOL.get(protocol)
        if config_cls is None:
            raise ValueError(f"Unsupported protocol: {protocol}")  # noqa: EM102, TRY003

        # Already a config instance of the right type → accept as-is
        if isinstance(v, config_cls):
            return v

        # Dict → let the config Pydantic model do full validation
        if isinstance(v, dict):
            return config_cls.model_validate(v)

        msg = (
            f"config for {protocol} must be a dict or {config_cls.__name__}, "
            f"got {type(v).__name__}"
        )
        raise TypeError(msg)
