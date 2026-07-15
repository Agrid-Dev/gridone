import logging
from abc import ABC, abstractmethod
from asyncio import Lock, Task, create_task
from collections.abc import AsyncGenerator
from contextlib import AbstractAsyncContextManager, nullcontext
from typing import ClassVar, TypeVar

from devices_manager.types import AttributeValueType, TransportProtocols, TransportType

from .base_transport_config import BaseTransportConfig
from .listener_registry import ListenerCallback, ListenerRegistry
from .read_result import ReadError, ReadOk, ReadResult
from .transport_address import (
    PushTransportAddress,
    RawTransportAddress,
    TransportAddress,
)
from .transport_connection_state import TransportConnectionState
from .transport_metadata import TransportMetadata

T_TransportAddress = TypeVar("T_TransportAddress", bound=TransportAddress)


logger = logging.getLogger(__name__)


def dedupe_addresses[T: TransportAddress](addresses: list[T]) -> dict[str, T]:
    """Collapse addresses sharing the same ``.id`` to one entry, keyed by id."""
    return {address.id: address for address in addresses}


class TransportClient[T_TransportAddress](ABC):
    protocol: ClassVar[TransportProtocols]
    transport_type: ClassVar[TransportType]
    _config_builder: ClassVar[type[BaseTransportConfig]]
    _serialize_reads: ClassVar[bool] = False
    config: BaseTransportConfig
    metadata: TransportMetadata
    connection_state: TransportConnectionState
    address_builder: type[T_TransportAddress]
    _connection_lock: Lock
    _read_lock: AbstractAsyncContextManager
    _background_tasks: set[Task]
    _read_cache: dict[str, tuple[str, AttributeValueType]]
    _cache_epoch: int

    def __init__(
        self, metadata: TransportMetadata, config: BaseTransportConfig
    ) -> None:
        self._handlers_registry = ListenerRegistry()
        self._connection_lock = Lock()
        self._read_lock = Lock() if self._serialize_reads else nullcontext()
        self.connection_state = TransportConnectionState.idle()
        self.config = config
        self.metadata = metadata
        self._background_tasks = set()
        self._read_cache = {}
        self._cache_epoch = 0

    @property
    def id(self) -> str:
        return self.metadata.id

    def build_address(
        self, raw_address: RawTransportAddress, context: dict | None = None
    ) -> T_TransportAddress:
        return self.address_builder.from_raw(raw_address, extra_context=context)  # ty: ignore[unresolved-attribute]

    @abstractmethod
    async def connect(self) -> None:
        """Establish a connection to the transport."""
        self.connection_state = TransportConnectionState.connected()
        logger.info(
            "Transport client %s (%s) connected", self.metadata.id, self.protocol
        )

    @abstractmethod
    async def close(self) -> None:
        """Close the connection and release resources."""
        self.connection_state = TransportConnectionState.closed()
        self._read_cache.clear()
        self._cache_epoch += 1
        logger.info("Transport client %s closed", self.protocol)

    async def read(
        self,
        address: T_TransportAddress,
        correlation_id: str | None = None,
    ) -> AttributeValueType:
        """Read a value from the transport.

        With a ``correlation_id``, the value is cached per ``address.id`` and
        reused for later reads sharing that id (one sweep). ``None`` always hits
        the network and never touches the cache.
        """
        if correlation_id is not None:
            cached = self._read_cache.get(address.id)  # ty: ignore[unresolved-attribute]
            if cached is not None and cached[0] == correlation_id:
                return cached[1]
        async with self._read_lock:
            epoch = self._cache_epoch
            value = await self._read(address)
            # Skip the store if a close()/reconnect cleared the cache while the
            # network read was in flight — otherwise a stale entry would survive.
            if correlation_id is not None and self._cache_epoch == epoch:
                self._read_cache[address.id] = (correlation_id, value)  # ty: ignore[unresolved-attribute]
            return value

    @abstractmethod
    async def _read(self, address: T_TransportAddress) -> AttributeValueType:
        """Perform the actual read, without lock handling."""
        ...

    async def _read_one(
        self,
        address: T_TransportAddress,
        correlation_id: str | None,
    ) -> ReadResult:
        """Read a single address, wrapping the outcome instead of raising."""
        try:
            value = await self.read(address, correlation_id)
        except Exception as e:  # noqa: BLE001
            return ReadError(address.id, e)  # ty: ignore[unresolved-attribute]
        return ReadOk(address.id, value)  # ty: ignore[unresolved-attribute]

    async def read_many(
        self,
        addresses: list[T_TransportAddress],
        correlation_id: str | None = None,
    ) -> AsyncGenerator[ReadResult]:
        """Read each address in turn, yielding a result as each one lands.

        Base default: sequential, via :meth:`read` (cache + lock included).
        Transports that can fetch concurrently or batch addresses into one
        transaction override this with a different strategy.
        """
        for address in dedupe_addresses(addresses).values():  # ty: ignore[invalid-argument-type]
            yield await self._read_one(address, correlation_id)

    async def collect(
        self,
        addresses: list[T_TransportAddress],
        correlation_id: str | None = None,
    ) -> dict[str, AttributeValueType | Exception]:
        """Gather :meth:`read_many` into a ``{address_id: value | error}`` dict."""
        return {
            result.address_id: result.value
            if isinstance(result, ReadOk)
            else result.error
            async for result in self.read_many(addresses, correlation_id)
        }

    @abstractmethod
    async def write(
        self,
        address: T_TransportAddress,
        value: AttributeValueType,
    ) -> None:
        """Write a value to the transport."""
        ...

    async def __aenter__(self) -> "TransportClient[T_TransportAddress]":
        """Support async context manager (async with)."""
        await self.connect()
        return self

    async def __aexit__(
        self,
        exc_type: object,
        exc_val: BaseException | None,
        exc_tb: object,
    ) -> None:
        """Ensure the client is closed when exiting the context."""
        await self.close()

    def schedule_reconnect(self) -> None:
        async def reconnect() -> None:
            await self.close()
            await self.connect()

        task = create_task(reconnect())
        self._background_tasks.add(task)
        task.add_done_callback(self._background_tasks.discard)

    def update_config(
        self, config: BaseTransportConfig | dict, *, reconnect: bool = True
    ) -> None:
        if isinstance(config, BaseTransportConfig):
            config = config.model_dump()
        # Merge the partial patch onto the current config and re-validate against
        # this transport's own config class — the PATCH body is untyped, so this
        # is where a partial update is type-checked and defaults are preserved.
        merged = {**self.config.model_dump(), **config}
        self.config = type(self.config).model_validate(merged)
        if reconnect:
            self.schedule_reconnect()


class PullTransportClient[T_TransportAddress](TransportClient[T_TransportAddress]):
    transport_type: ClassVar[TransportType] = TransportType.PULL


T_PushTransportAddress = TypeVar("T_PushTransportAddress", bound=PushTransportAddress)


class PushTransportClient[T_PushTransportAddress](
    TransportClient[T_PushTransportAddress]
):
    transport_type: ClassVar[TransportType] = TransportType.PUSH

    @abstractmethod
    async def register_listener(self, topic: str, callback: ListenerCallback) -> str:
        """Register a listener on an address
        with a handler when receiving data on the address."""

    @abstractmethod
    async def unregister_listener(
        self, callback_id: str, topic: str | None = None
    ) -> None:
        """Unregister handler on an address by handler_id."""
