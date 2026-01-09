from typing import Annotated, Literal

from core.transports import TransportClient, TransportMetadata, make_transport_client
from core.transports.bacnet_transport import (
    BacnetTransportConfig,
)
from core.transports.http_transport import HttpTransportConfig
from core.transports.modbus_tcp_transport import (
    ModbusTCPTransportConfig,
)
from core.transports.mqtt_transport import MqttTransportConfig
from core.types import TransportProtocols
from pydantic import BaseModel, Field


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


def core_to_dto(client: TransportClient) -> TransportDTO:
    dto_class = DTO_BY_PROTOCOL.get(client.protocol)
    if not dto_class:
        msg = (
            "Transport client did not match any supported client, cannot convert to dto"
        )
        raise ValueError(msg)
    return dto_class(
        id=client.metadata.id,
        name=client.metadata.name,
        protocol=client.protocol,
        config=client.config,
    )
