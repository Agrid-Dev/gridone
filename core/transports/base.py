from abc import ABC, abstractmethod
from typing import ClassVar

from core.types import AttributeValueType, TransportProtocols
from core.value_parsers import ValueParser


class TransportClient(ABC):
    protocol: ClassVar[TransportProtocols]

    @abstractmethod
    async def connect(self) -> None:
        """Establish a connection to the transport."""
        raise NotImplementedError

    @abstractmethod
    async def close(self) -> None:
        """Close the connection and release resources."""
        raise NotImplementedError

    @abstractmethod
    async def read(
        self,
        address: str | dict,
        value_parser: ValueParser | None = None,
        *,
        context: dict,
    ) -> AttributeValueType:
        """Read a value from the transport."""
        ...

    @abstractmethod
    async def write(
        self,
        address: str,
        value: AttributeValueType,
    ) -> None:
        """Write a value to the transport."""
        ...

    # Default implementation for async context manager
    async def __aenter__(self) -> "TransportClient":
        """Support async context manager (async with)."""
        await self.connect()
        print("__aenter__ !")
        return self

    async def __aexit__(
        self,
        exc_type: object,
        exc_val: BaseException | None,
        exc_tb: object,
    ) -> None:
        """Ensure the client is closed when exiting the context."""
        await self.close()
        print("__aexit__ !")
