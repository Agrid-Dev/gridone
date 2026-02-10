from functools import cached_property

from pydantic import BaseModel

from devices_manager.core.transports.hash_model import hash_model
from devices_manager.core.transports.transport_address import (
    RawTransportAddress,
    TransportAddress,
)


class MqttRequest(BaseModel):
    topic: str
    message: str | dict


class MqttAddress(BaseModel, TransportAddress):
    topic: str
    request: MqttRequest

    @cached_property
    def id(self) -> str:
        return hash_model(self)

    @classmethod
    def from_str(
        cls, address_str: str, extra_context: dict | None = None
    ) -> "MqttAddress":
        msg = "Creating mqtt address from string is not supported."
        raise NotImplementedError(msg)

    @classmethod
    def from_dict(
        cls, address_dict: dict, extra_context: dict | None = None
    ) -> "MqttAddress":
        combined_context = {**address_dict, **(extra_context or {})}
        return cls(**combined_context)

    @classmethod
    def from_raw(
        cls, raw_address: RawTransportAddress, extra_context: dict | None = None
    ) -> "MqttAddress":
        if isinstance(raw_address, str):
            return cls.from_str(raw_address, extra_context)
        if isinstance(raw_address, dict):
            return cls.from_dict(raw_address, extra_context)
        msg = "Invalid raw address type"
        raise ValueError(msg)
