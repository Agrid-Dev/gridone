from pydantic import BaseModel

from core.transports.transport_address import RawTransportAddress, TransportAddress


class MqttRequest(BaseModel):
    topic: str
    message: str


class MqttAddress(BaseModel, TransportAddress):
    topic: str
    request_read: MqttRequest

    @classmethod
    def from_str(cls, _: str) -> "MqttAddress":
        msg = "Creating mqtt address from string is not supported."
        raise NotImplementedError(msg)

    @classmethod
    def from_dict(cls, raw_address: dict) -> "MqttAddress":
        return cls(**raw_address)  # ty: ignore[invalid-argument-type]

    @classmethod
    def from_raw(cls, raw_address: RawTransportAddress) -> "MqttAddress":
        if isinstance(raw_address, str):
            return cls.from_str(raw_address)
        if isinstance(raw_address, dict):
            return cls.from_dict(raw_address)
        msg = "Invalid raw address type"
        raise ValueError(msg)
