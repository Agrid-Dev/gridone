import logging
from abc import ABC, abstractmethod
from asyncio import Lock, Task, create_task
from typing import ClassVar, TypeVar

from devices_manager.types import AttributeValueType, TransportProtocols, TransportType
from models.errors import InvalidError

from .base_transport_config import BaseTransportConfig
from .listener_registry import ListenerCallback, ListenerRegistry
from .transport_address import (
    PushTransportAddress,
    RawTransportAddress,
    TransportAddress,
)
from .transport_connection_state import TransportConnectionState
from .transport_metadata import TransportMetadata

T_TransportAddress = TypeVar("T_TransportAddress", bound=TransportAddress)


logger = logging.getLogger(__name__)


class TransportClient[T_TransportAddress](ABC):
    protocol: ClassVar[TransportProtocols]
    transport_type: ClassVar[TransportType]
    _config_builder: ClassVar[type[BaseTransportConfig]]
    config: BaseTransportConfig
    metadata: TransportMetadata
    connection_state: TransportConnectionState
    address_builder: type[T_TransportAddress]
    _connection_lock: Lock
    _background_tasks: set[Task]

    def __init__(
        self, metadata: TransportMetadata, config: BaseTransportConfig
    ) -> None:
        self._handlers_registry = ListenerRegistry()
        self._connection_lock = Lock()
        self.connection_state = TransportConnectionState.idle()
        self.config = config
        self.metadata = metadata
        self._background_tasks = set()

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
        logger.info("Transport client %s closed", self.protocol)

    @abstractmethod
    async def read(self, address: T_TransportAddress) -> AttributeValueType:
        """Read a value from the transport."""
        ...

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
        config = self._apply_secret_update_semantics(config)
        # Merge the partial patch onto the current config and re-validate against
        # this transport's own config class — the PATCH body is untyped, so this
        # is where a partial update is type-checked and defaults are preserved.
        merged = {**self.config.model_dump(), **config}
        self.config = type(self.config).model_validate(merged)
        if reconnect:
            self.schedule_reconnect()

    def _apply_secret_update_semantics(self, config: dict) -> dict:
        """Write-only rules for secret fields on a partial (PATCH) update.

        A secret omitted or sent as ``null`` keeps the stored value (dropped
        from the patch before the merge); a non-empty value replaces it; an
        empty string is rejected. This guarantees a secret can be replaced but
        never silently wiped — even by a client that echoes back the full
        masked config with nulls.
        """
        secret_names = type(self.config).secret_field_names()
        patch = dict(config)
        for name in secret_names:
            if name not in patch:
                continue
            value = patch[name]
            if value is None:
                del patch[name]
            elif value == "":
                msg = f"'{name}' cannot be set to an empty value"
                raise InvalidError(msg)
        return patch


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
