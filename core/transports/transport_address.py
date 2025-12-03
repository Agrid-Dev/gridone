from abc import ABC, abstractmethod

type RawTransportAddress = str | dict


class TransportAddress(ABC):
    """Represents an attribute address on a device.
    A TransportAddress must be unique pber transport and point
    to a single attribute on a single device."""

    @property
    @abstractmethod
    def id(self) -> str:
        """Returns a unique ID built from address properties.
        2 addresses with same properties will have the same ID."""

    @classmethod
    @abstractmethod
    def from_str(
        cls, address_str: str, extra_context: dict | None = None
    ) -> "TransportAddress":
        pass

    @classmethod
    @abstractmethod
    def from_dict(
        cls, address_dict: dict, extra_context: dict | None = None
    ) -> "TransportAddress":
        pass

    @classmethod
    @abstractmethod
    def from_raw(
        cls, raw_address: RawTransportAddress, extra_context: dict | None = None
    ) -> "TransportAddress":
        pass
