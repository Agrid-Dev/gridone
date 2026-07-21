from datetime import datetime
from typing import Annotated, Any, Literal

from pydantic import BaseModel, Field

from devices_manager.core.transports import (
    BaseTransportConfig,
    TransportClient,
    TransportConnectionState,
    TransportMetadata,
    make_transport_client,
)
from devices_manager.core.transports.bacnet_transport import (
    BacnetTransportConfig,
)
from devices_manager.core.transports.factory import make_transport_config
from devices_manager.core.transports.http_transport import HttpTransportConfig
from devices_manager.core.transports.knx_transport import KNXTransportConfig
from devices_manager.core.transports.mbus_transport import MBusTransportConfig
from devices_manager.core.transports.modbus_tcp_transport import (
    ModbusTCPTransportConfig,
)
from devices_manager.core.transports.mqtt_transport import MqttTransportConfig
from devices_manager.types import TransportProtocols
from models.metadata import ResourceMetadata


class TransportBase(ResourceMetadata):
    id: str
    name: str
    connection_state: TransportConnectionState


class HttpTransport(TransportBase):
    protocol: Literal[TransportProtocols.HTTP]
    config: HttpTransportConfig


class KnxTransport(TransportBase):
    protocol: Literal[TransportProtocols.KNX]
    config: KNXTransportConfig


class MqttTransport(TransportBase):
    protocol: Literal[TransportProtocols.MQTT]
    config: MqttTransportConfig


class ModbusTcpTransport(TransportBase):
    protocol: Literal[TransportProtocols.MODBUS_TCP]
    config: ModbusTCPTransportConfig


class MbusTransport(TransportBase):
    protocol: Literal[TransportProtocols.MBUS]
    config: MBusTransportConfig


class BacnetTransport(TransportBase):
    protocol: Literal[TransportProtocols.BACNET]
    config: BacnetTransportConfig


Transport = Annotated[
    HttpTransport
    | KnxTransport
    | MqttTransport
    | ModbusTcpTransport
    | MbusTransport
    | BacnetTransport,
    Field(discriminator="protocol"),
]


def dto_to_core(dto: Transport) -> TransportClient:
    return make_transport_client(
        dto.protocol,
        dto.config,
        TransportMetadata(
            id=dto.id,
            name=dto.name,
            created_at=dto.created_at,
            updated_at=dto.updated_at,
        ),
    )


DTO_BY_PROTOCOL = {
    TransportProtocols.HTTP: HttpTransport,
    TransportProtocols.KNX: KnxTransport,
    TransportProtocols.MQTT: MqttTransport,
    TransportProtocols.MODBUS_TCP: ModbusTcpTransport,
    TransportProtocols.MBUS: MbusTransport,
    TransportProtocols.BACNET: BacnetTransport,
}

DEFAULT_CONNECTION_STATE = TransportConnectionState.idle()


def build_dto(  # noqa: PLR0913
    transport_id: str,
    name: str,
    protocol: TransportProtocols,
    config: BaseTransportConfig | dict,
    connection_state: TransportConnectionState = DEFAULT_CONNECTION_STATE,
    created_at: datetime | None = None,
    updated_at: datetime | None = None,
) -> Transport:
    dto_class = DTO_BY_PROTOCOL.get(protocol)
    if not dto_class:
        msg = (
            "Transport client did not match any supported client, cannot convert to dto"
        )
        raise ValueError(msg)
    if not isinstance(config, BaseTransportConfig):
        config = make_transport_config(protocol, config)
    kwargs = {}
    if created_at is not None:
        kwargs["created_at"] = created_at
    if updated_at is not None:
        kwargs["updated_at"] = updated_at
    return dto_class(
        id=transport_id,
        name=name,
        protocol=protocol,  # ty: ignore[invalid-argument-type]
        config=config,  # ty: ignore[invalid-argument-type]
        connection_state=connection_state,
        **kwargs,
    )


def core_to_dto(client: TransportClient) -> Transport:
    return build_dto(
        client.metadata.id,
        client.metadata.name,
        client.protocol,
        client.config,
        client.connection_state,
        client.metadata.created_at,
        client.metadata.updated_at,
    )


CONFIG_CLASS_BY_PROTOCOL: dict[TransportProtocols, type[BaseTransportConfig]] = {
    TransportProtocols.HTTP: HttpTransportConfig,
    TransportProtocols.KNX: KNXTransportConfig,
    TransportProtocols.MQTT: MqttTransportConfig,
    TransportProtocols.MODBUS_TCP: ModbusTCPTransportConfig,
    TransportProtocols.MBUS: MBusTransportConfig,
    TransportProtocols.BACNET: BacnetTransportConfig,
}


class TransportCreateBase(BaseModel):
    name: str


class HttpTransportCreate(TransportCreateBase):
    protocol: Literal[TransportProtocols.HTTP]
    config: HttpTransportConfig


class KnxTransportCreate(TransportCreateBase):
    protocol: Literal[TransportProtocols.KNX]
    config: KNXTransportConfig


class MqttTransportCreate(TransportCreateBase):
    protocol: Literal[TransportProtocols.MQTT]
    config: MqttTransportConfig


class ModbusTcpTransportCreate(TransportCreateBase):
    protocol: Literal[TransportProtocols.MODBUS_TCP]
    config: ModbusTCPTransportConfig


class MbusTransportCreate(TransportCreateBase):
    protocol: Literal[TransportProtocols.MBUS]
    config: MBusTransportConfig


class BacnetTransportCreate(TransportCreateBase):
    protocol: Literal[TransportProtocols.BACNET]
    config: BacnetTransportConfig


# Mirrors the read-side `Transport` union so `protocol` narrows `config` to the
# matching per-protocol config, both server-side and in generated client types.
TransportCreate = Annotated[
    HttpTransportCreate
    | KnxTransportCreate
    | MqttTransportCreate
    | ModbusTcpTransportCreate
    | MbusTransportCreate
    | BacnetTransportCreate,
    Field(discriminator="protocol"),
]


class TransportUpdate(BaseModel):
    name: str | None = None
    # A partial config patch. PATCH carries no `protocol` to discriminate the
    # per-protocol union on, and a partial body would fail its required fields
    # anyway (e.g. `host`), so the config is left as a raw mapping here and
    # merged + validated against the transport's own config class when applied
    # (see `TransportClient.update_config`).
    config: dict[str, Any] | None = None
