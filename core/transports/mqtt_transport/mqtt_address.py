from functools import cached_property

from pydantic import BaseModel

from core.transports.hash_model import hash_model
from core.transports.transport_address import RawTransportAddress, TransportAddress


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
    def from_str(cls, address_str: str) -> "MqttAddress":
        msg = "Creating mqtt address from string is not supported."
        raise NotImplementedError(msg)

    @classmethod
    def from_dict(cls, address_dict: dict) -> "MqttAddress":
        return cls(**address_dict)

    @classmethod
    def from_raw(cls, raw_address: RawTransportAddress) -> "MqttAddress":
        if isinstance(raw_address, str):
            return cls.from_str(raw_address)
        if isinstance(raw_address, dict):
            return cls.from_dict(raw_address)
        msg = "Invalid raw address type"
        raise ValueError(msg)
