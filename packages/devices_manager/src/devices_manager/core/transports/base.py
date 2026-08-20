import logging
from abc import ABC, abstractmethod
from asyncio import Lock, Task, create_task
from collections.abc import AsyncGenerator
from contextlib import AbstractAsyncContextManager, nullcontext
from contextvars import ContextVar
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

# Task-local, not an instance attribute: concurrent callers on the same
# transport (e.g. one queued behind another's rejection) run as separate
# tasks, and each must see its own snapshot rather than clobbering a
# sibling's. See TransportClient._raise_if_terminally_rejected.
_connect_attempt_generation: ContextVar[int] = ContextVar(
    "connect_attempt_generation", default=-1
)


class TerminalConnectionError(ConnectionError):
    """A connection failure that retrying, on its own, can never fix.

    Raise it from ``connect()`` and :meth:`TransportClient.ensure_connected`
    latches it: the transport parks in an error state and every later attempt
    re-raises it without touching the network, until ``update_config`` clears
    it — after an operator trusts a certificate, say.
    """


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
    _reconnect_task: Task | None
    _reconnect_pending: bool
    _terminal_error: TerminalConnectionError | None
    # Bumped by update_config(): lets a stale connect attempt recognize it's
    # been superseded and skip re-latching over the fix. See ensure_connected().
    _config_generation: int
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
        self._reconnect_task = None
        self._reconnect_pending = False
        self._terminal_error = None
        self._config_generation = 0
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

    def _snapshot_attempt_generation(self) -> None:
        """Refresh the task-local generation :meth:`_attempt_is_current` checks
        against. Callers that skip :meth:`ensure_connected` when already
        connected (e.g. a poll loop) must call this explicitly, since nothing
        else refreshes it for them."""
        _connect_attempt_generation.set(self._config_generation)

    def _raise_if_terminally_rejected(self) -> None:
        """Re-raise an already-latched terminal error. Called here and,
        post-lock, from each subclass's ``connect()``, so a queued caller
        fails fast instead of repeating a doomed attempt."""
        self._snapshot_attempt_generation()
        if self._terminal_error is not None:
            # Re-park on every raise, not just the first: a coalesced reconnect
            # runs close() beforehand, which resets the state to closed() and
            # would otherwise leave a permanently refusing transport reporting
            # idle with no remediation message.
            self.connection_state = TransportConnectionState.connection_error(
                str(self._terminal_error)
            )
            # Same instance every time, so drop the traceback it accumulated on
            # the previous raise rather than growing it for the transport's life.
            raise self._terminal_error.with_traceback(None)

    def _attempt_is_current(self) -> bool:
        """False if a newer config has superseded the attempt that just failed."""
        return _connect_attempt_generation.get() == self._config_generation

    async def ensure_connected(self) -> None:
        """Connect unless a previous attempt failed terminally.

        Every caller that would otherwise call :meth:`connect` goes through
        here, so one refusal is paid once rather than on every read: ``@connected``
        re-attempts a connection on each read while the transport is down.
        """
        self._raise_if_terminally_rejected()
        try:
            await self.connect()
        except TerminalConnectionError as e:
            if self._attempt_is_current():
                self._terminal_error = e
                self.connection_state = TransportConnectionState.connection_error(
                    str(e)
                )
            raise

    async def __aenter__(self) -> "TransportClient[T_TransportAddress]":
        """Support async context manager (async with).

        Transports are shared across devices, so this connect() call — unlike
        the one @connected triggers from inside an already-_read_lock-held
        read() — can race a read on another device. Holding _read_lock here
        gives it the same protection close() has, without risking the
        reentrant deadlock a blanket lock in connect() itself would cause.
        """
        async with self._read_lock:
            await self.ensure_connected()
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
        """Fire-and-forget close+connect, single-flight: a call made while a
        previous reconnect is still running never races a second
        close()/connect() pair against it — it's coalesced into one more
        cycle right after the in-flight one finishes, so a config update
        (e.g. update_config()) that lands mid-reconnect still takes effect
        instead of being silently dropped."""
        if self._reconnect_task is not None and not self._reconnect_task.done():
            self._reconnect_pending = True
            return

        async def reconnect() -> None:
            try:
                await self.close()
                await self.ensure_connected()
            except TerminalConnectionError:
                # Retrying would spin at full speed forever (there is no
                # backoff below), so stop and wait for a config change.
                # ensure_connected has already parked the connection state.
                logger.exception(
                    "[Transport %s] reconnect abandoned, not retryable",
                    self.id,
                )
            except Exception:  # noqa: BLE001
                # Nothing else retries a failed connect() here, so coalesce
                # one more attempt via the same pending mechanism.
                logger.warning(
                    "[Transport %s] reconnect attempt failed, retrying",
                    self.id,
                    exc_info=True,
                )
                self._reconnect_pending = True

        task = create_task(reconnect())
        self._reconnect_task = task
        self._background_tasks.add(task)
        task.add_done_callback(self._background_tasks.discard)
        task.add_done_callback(self._run_pending_reconnect)

    def _run_pending_reconnect(self, _task: Task) -> None:
        if self._reconnect_pending:
            self._reconnect_pending = False
            self.schedule_reconnect()

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
        # A new config re-arms a terminally refused transport: the operator's
        # way back once the underlying condition is fixed.
        self._terminal_error = None
        self._config_generation += 1
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
    # Push-only transports (MQTT, KNX, Webhook) need every attribute
    # subscribed — polling isn't an alternative for them. A hybrid transport
    # (pull + push, e.g. OPC-UA) sets this True so CoreDevice.init_listeners
    # only subscribes attributes explicitly opted in via AttributeDriver.push.
    push_is_opt_in: ClassVar[bool] = False

    @abstractmethod
    async def register_listener(self, topic: str, callback: ListenerCallback) -> str:
        """Register a listener on an address
        with a handler when receiving data on the address."""

    @abstractmethod
    async def unregister_listener(
        self, callback_id: str, topic: str | None = None
    ) -> None:
        """Unregister handler on an address by handler_id."""
