from abc import ABC, abstractmethod

type RawTransportAddress = str | dict


class TransportAddress(ABC):
    @classmethod
    @abstractmethod
    def from_str(cls, address_str: str) -> "TransportAddress":
        pass

    @classmethod
    @abstractmethod
    def from_dict(cls, address_dict: dict) -> "TransportAddress":
        pass

    @classmethod
    @abstractmethod
    def from_raw(cls, raw_address: RawTransportAddress) -> "TransportAddress":
        pass
