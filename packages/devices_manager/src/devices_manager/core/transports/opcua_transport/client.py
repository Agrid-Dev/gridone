import asyncio
import contextlib
import logging
from collections.abc import AsyncGenerator
from typing import ClassVar

from asyncua import Client, ua

from devices_manager.core.transports.base import PullTransportClient, dedupe_addresses
from devices_manager.core.transports.connected import connected
from devices_manager.core.transports.io_timing import timed_io
from devices_manager.core.transports.read_result import ReadError, ReadOk, ReadResult
from devices_manager.core.transports.transport_connection_state import (
    TransportConnectionState,
)
from devices_manager.core.transports.transport_metadata import TransportMetadata
from devices_manager.types import AttributeValueType, TransportProtocols

from .errors import OpcuaNotConnectedError, translate_write_error
from .opcua_address import OpcuaAddress
from .transport_config import OpcuaTransportConfig
from .variant_decode import decode_variant
from .variant_encode import coerce_for_write

logger = logging.getLogger(__name__)


class OpcuaTransportClient(PullTransportClient[OpcuaAddress]):
    protocol: ClassVar[TransportProtocols] = TransportProtocols.OPCUA
    _config_builder = OpcuaTransportConfig
    address_builder = OpcuaAddress
    config: OpcuaTransportConfig
    _client: Client | None
    _serialize_reads = False

    def __init__(
        self, metadata: TransportMetadata, config: OpcuaTransportConfig
    ) -> None:
        self._client = None
        super().__init__(metadata, config)

    def _require_client(self) -> Client:
        if self._client is None:
            msg = f"Transport {self.id} is not connected"
            raise OpcuaNotConnectedError(msg)
        return self._client

    @staticmethod
    def _extract_value(data_value: ua.DataValue) -> AttributeValueType | dict | list:
        # StatusCode/Value are typed optional but always set on a real read.
        if data_value.StatusCode is not None:
            data_value.StatusCode.check()
        if data_value.Value is None:
            msg = "OPC-UA server returned no value"
            raise ua.uaerrors.BadUnexpectedError(msg)
        return decode_variant(data_value.Value)

    async def connect(self) -> None:
        async with self._connection_lock:
            if self.connection_state.is_connected:
                return
            client = Client(
                url=self.config.endpoint_url,
                timeout=self.config.request_timeout,
                watchdog_intervall=self.config.keepalive_interval,
            )
            if self.config.auth_mode == "username_password":
                client.set_user(self.config.username)  # ty: ignore[invalid-argument-type]
                client.set_password(self.config.password)  # ty: ignore[invalid-argument-type]
            client.connection_lost_callback = self._on_connection_lost
            try:
                await asyncio.wait_for(
                    client.connect(), timeout=self.config.connect_timeout
                )
            except Exception:
                # A failed/timed-out connect() may still have opened a socket
                # mid-handshake; self._client is only assigned below, so
                # nothing else can clean it up.
                with contextlib.suppress(Exception):
                    await client.disconnect()
                raise
            self._client = client
            await super().connect()

    async def close(self) -> None:
        # _read_lock is a nullcontext here (_serialize_reads=False), so it
        # doesn't serialize against an in-flight read — only _connection_lock
        # does (see base.py's lock-order note). An in-flight read racing this
        # close() fails with a clean exception rather than hanging or
        # returning a stale/wrong result.
        async with self._read_lock, self._connection_lock:
            if self._client is not None:
                try:
                    await self._client.disconnect()
                except Exception:  # noqa: BLE001
                    logger.warning(
                        "[Transport %s] error while disconnecting",
                        self.id,
                        exc_info=True,
                    )
                self._client = None
            await super().close()

    async def _on_connection_lost(self, exc: Exception) -> None:
        """asyncua's hook for a session lost outside a request."""
        logger.warning(
            "[Transport %s] OPC-UA session lost — %s: %s",
            self.id,
            type(exc).__name__,
            exc,
        )
        self.connection_state = TransportConnectionState.connection_error(str(exc))
        self.schedule_reconnect()

    @connected
    async def _read(self, address: OpcuaAddress) -> AttributeValueType:
        client = self._require_client()
        node = client.get_node(address.id)
        data_value = await node.read_data_value()
        return self._extract_value(data_value)  # ty: ignore[invalid-return-type]

    async def read_many(
        self,
        addresses: list[OpcuaAddress],
        sweep_id: str | None = None,  # noqa: ARG002
    ) -> AsyncGenerator[ReadResult]:
        """Batch every address into one OPC-UA Read service call instead of
        the base class's per-address fan-out. Bypasses :meth:`read`, so it
        wraps its own wire call in ``timed_io``. A connect/read failure is
        isolated to a ``ReadError`` per address rather than raised, same as
        the base ``read_many``."""
        ordered_addresses = list(dedupe_addresses(addresses).values())
        if not ordered_addresses:
            return
        try:
            if not self.connection_state.is_connected:
                await self.connect()
            client = self._require_client()
            nodes = [client.get_node(address.id) for address in ordered_addresses]
            async with timed_io(self.id, self.protocol, len(ordered_addresses)):
                data_values = await client.read_attributes(nodes)
        except Exception as e:  # noqa: BLE001
            logger.warning(
                "[Transport %s] read_many batch failed — %s: %s",
                self.id,
                type(e).__name__,
                e,
            )
            for address in ordered_addresses:
                yield ReadError(address.id, e)
            return
        if len(data_values) != len(ordered_addresses):
            # A spec-compliant server always returns one result per
            # requested node; treat a mismatch as a per-address failure
            # rather than raising `zip(strict=True)`'s ValueError out of
            # this generator, breaking the per-address isolation contract.
            err = ua.uaerrors.BadUnexpectedError("Result count mismatch")
            for address in ordered_addresses:
                yield ReadError(address.id, err)
            return
        for address, data_value in zip(ordered_addresses, data_values, strict=True):
            try:
                value = self._extract_value(data_value)
                yield ReadOk(address.id, value)  # ty: ignore[invalid-argument-type]
            except Exception as e:  # noqa: BLE001
                yield ReadError(address.id, e)

    @connected
    async def write(self, address: OpcuaAddress, value: AttributeValueType) -> None:
        client = self._require_client()
        node = client.get_node(address.id)
        variant_type = await node.read_data_type_as_variant_type()
        try:
            coerced_value = coerce_for_write(value, variant_type)
            await node.write_value(coerced_value, variant_type)
        except Exception as e:
            raise translate_write_error(e) from e
