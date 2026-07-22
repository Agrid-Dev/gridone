import logging
from abc import ABC, abstractmethod
from asyncio import Lock, Task, create_task
from collections.abc import AsyncGenerator
from contextlib import AbstractAsyncContextManager, nullcontext
from typing import ClassVar

from devices_manager.types import AttributeValueType, TransportProtocols, TransportType

from .base_transport_config import BaseTransportConfig
from .batch_read import read_results
from .io_timing import timed_io
from .listener_registry import ListenerCallback, ListenerRegistry
from .read_result import ReadResult
from .sweep_memo import SweepMemo, memoize_sweep
from .transport_address import (
    PushTransportAddress,
    RawTransportAddress,
    TransportAddress,
)
from .transport_connection_state import TransportConnectionState
from .transport_metadata import TransportMetadata

logger = logging.getLogger(__name__)


def dedupe_addresses[T: TransportAddress](addresses: list[T]) -> dict[str, T]:
    """Collapse addresses sharing the same ``.id`` to one entry, keyed by id."""
    return {address.id: address for address in addresses}


class TransportClient[T_TransportAddress: TransportAddress](ABC):
    protocol: ClassVar[TransportProtocols]
    transport_type: ClassVar[TransportType]
    _config_builder: ClassVar[type[BaseTransportConfig]]
    # Single knob for the read path: gates read()'s lock and, in turn, the base
    # read_many() strategy — sequential when True, concurrent fan-out when False.
    _serialize_reads: ClassVar[bool] = False
    config: BaseTransportConfig
    metadata: TransportMetadata
    connection_state: TransportConnectionState
    address_builder: type[T_TransportAddress]
    _connection_lock: Lock
    # A subclass close() that tears down/replaces the connection must acquire
    # _read_lock before _connection_lock, never the reverse: a read's own
    # internal reconnect (via @connected) only ever acquires _connection_lock
    # while already holding _read_lock, so the opposite order would deadlock.
    _read_lock: AbstractAsyncContextManager
    _background_tasks: set[Task]
    _sweep_memo: SweepMemo

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
        self._sweep_memo = SweepMemo(self.id, self.protocol)

    @property
    def id(self) -> str:
        return self.metadata.id

    def build_address(
        self, raw_address: RawTransportAddress, context: dict | None = None
    ) -> T_TransportAddress:
        return self.address_builder.from_raw(raw_address, extra_context=context)

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
        logger.info("Transport client %s closed", self.protocol)

    @memoize_sweep
    async def read(
        self,
        address: T_TransportAddress,
        sweep_id: str | None = None,  # noqa: ARG002
    ) -> AttributeValueType:
        """Read a value from the transport.

        Wrapped by `memoize_sweep`: with a ``sweep_id`` the value is
        memoized in ``self._sweep_memo`` per ``address.id`` and reused for later
        reads sharing that id (one sweep); ``None`` always hits the network and
        never stores.
        """
        async with self._read_lock, timed_io(self.id, self.protocol, 1):
            return await self._read(address)

    @abstractmethod
    async def _read(self, address: T_TransportAddress) -> AttributeValueType:
        """Perform the actual read, without lock handling."""
        ...

    async def read_many(
        self,
        addresses: list[T_TransportAddress],
        sweep_id: str | None = None,
    ) -> AsyncGenerator[ReadResult]:
        """Read each distinct address, yielding a result as each one lands.

        Strategy follows :attr:`_serialize_reads`: sequential (results in
        address order) when set, concurrent fan-out otherwise. The concurrent
        default yields in completion order, not address order, so callers must
        key on ``result.address_id`` rather than the input position. Reads go
        through :meth:`read`, so the per-sweep cache and read lock apply.
        Transports that batch addresses into one transaction override this
        with their own strategy.

        Contract: an override that bypasses :meth:`read` must wrap each of its
        own wire transactions in ``timed_io`` — the base I/O metric fires from
        :meth:`read`, so an override that forgets it is a silent metrics gap.
        """
        async for result in read_results(
            dedupe_addresses(addresses).values(),
            lambda address: self.read(address, sweep_id),
            concurrent=not self._serialize_reads,
        ):
            yield result

    @abstractmethod
    async def write(
        self,
        address: T_TransportAddress,
        value: AttributeValueType,
    ) -> None:
        """Write a value to the transport."""
        ...

    async def __aenter__(self) -> "TransportClient[T_TransportAddress]":
        """Support async context manager (async with).

        Transports are shared across devices, so this connect() call — unlike
        the one @connected triggers from inside an already-_read_lock-held
        read() — can race a read on another device. Holding _read_lock here
        gives it the same protection close() has, without risking the
        reentrant deadlock a blanket lock in connect() itself would cause.
        """
        async with self._read_lock:
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


class PullTransportClient[T_TransportAddress: TransportAddress](
    TransportClient[T_TransportAddress]
):
    transport_type: ClassVar[TransportType] = TransportType.PULL


class PushTransportClient[T_PushTransportAddress: PushTransportAddress](
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
