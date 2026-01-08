from typing import Annotated, Literal

from core.transports import TransportClient, TransportMetadata, make_transport_client
from core.transports.bacnet_transport import (
    BacnetTransportClient,
    BacnetTransportConfig,
)
from core.transports.http_transport import HTTPTransportClient, HttpTransportConfig
from core.transports.modbus_tcp_transport import (
    ModbusTCPTransportClient,
    ModbusTCPTransportConfig,
)
from core.transports.mqtt_transport import MqttTransportClient, MqttTransportConfig
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


def core_to_dto(client: TransportClient) -> TransportDTO:
    if isinstance(client, HTTPTransportClient):
        return HttpTransportDTO(
            id=client.metadata.id,
            name=client.metadata.name,
            protocol=client.protocol,
            config=client.config,
        )
    if isinstance(client, MqttTransportClient):
        return MqttTransportDTO(
            id=client.metadata.id,
            name=client.metadata.name,
            protocol=client.protocol,
            config=client.config,
        )
    if isinstance(client, ModbusTCPTransportClient):
        return ModbusTcpTransportDTO(
            id=client.metadata.id,
            name=client.metadata.name,
            protocol=client.protocol,
            config=client.config,
        )
    if isinstance(client, BacnetTransportClient):
        return BacnetTransportDTO(
            id=client.metadata.id,
            name=client.metadata.name,
            protocol=client.protocol,
            config=client.config,
        )
    msg = "Transport client did not match any supported client, cannot convert to dto"
    raise ValueError(msg)
