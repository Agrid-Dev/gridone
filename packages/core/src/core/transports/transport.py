from typing import Annotated, Any, Literal

from pydantic import BaseModel, Field, TypeAdapter, model_validator

from core.types import TransportProtocols

from .bacnet_transport import BacnetTransportConfig
from .http_transport import HttpTransportConfig
from .modbus_tcp_transport import ModbusTCPTransportConfig
from .mqtt_transport import MqttTransportConfig


class HttpTransport(BaseModel):
    protocol: Literal[TransportProtocols.HTTP]
    config: HttpTransportConfig


class MqttTransport(BaseModel):
    protocol: Literal[TransportProtocols.MQTT]
    config: MqttTransportConfig


class ModbusTcpTransport(BaseModel):
    protocol: Literal[TransportProtocols.MODBUS_TCP]
    config: ModbusTCPTransportConfig


class BacnetTransport(BaseModel):
    protocol: Literal[TransportProtocols.BACNET]
    config: BacnetTransportConfig


Transport = Annotated[
    HttpTransport | MqttTransport | ModbusTcpTransport | BacnetTransport,
    Field(discriminator="protocol"),
]


class TransportDTO(BaseModel):
    id: str
    transport: Transport

    @model_validator(mode="before")
    @classmethod
    def coerce_raw_shape(cls, data: Any) -> Any:  # noqa: ANN401
        """
        Accepts either:
            - {"id": "...", "transport": {"protocol": "...", "config": {...}}}
            - {"id": "...", "protocol": "...", "config": {...}}  (TransportRaw)
        and converts the latter into the former.
        """
        if not isinstance(data, dict):
            return data

        # Already in nested DTO shape
        if "transport" in data:
            return data

        # Raw shape -> nested shape
        if "protocol" in data and "config" in data:
            raw_transport = {"protocol": data["protocol"], "config": data["config"]}
            # Validate the discriminated union explicitly
            transport = TypeAdapter(Transport).validate_python(raw_transport)

            return {
                "id": data.get("id"),
                "transport": transport,
            }

        return data
