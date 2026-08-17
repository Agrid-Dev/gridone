import asyncio
import contextlib
import itertools
import logging
from collections.abc import AsyncGenerator
from typing import ClassVar

from asyncua import Client, Node, ua
from asyncua.common.subscription import DataChangeNotif, Subscription

from devices_manager.core.transports.base import (
    PullTransportClient,
    PushTransportClient,
    dedupe_addresses,
)
from devices_manager.core.transports.connected import connected
from devices_manager.core.transports.io_timing import timed_io
from devices_manager.core.transports.listener_registry import ListenerCallback
from devices_manager.core.transports.read_result import ReadError, ReadOk, ReadResult
from devices_manager.core.transports.transport_connection_state import (
    TransportConnectionState,
)
from devices_manager.core.transports.transport_metadata import TransportMetadata
from devices_manager.types import AttributeValueType, TransportProtocols, TransportType

from .errors import (
    OpcuaNotConnectedError,
    OpcuaSecurityError,
    is_secure_channel_rejection,
    translate_write_error,
)
from .opcua_address import OpcuaAddress
from .security import apply_security
from .transport_config import OpcuaTransportConfig
from .variant_decode import decode_variant
from .variant_encode import coerce_for_write

logger = logging.getLogger(__name__)


class OpcuaTransportClient(
    PullTransportClient[OpcuaAddress], PushTransportClient[OpcuaAddress]
):
    protocol: ClassVar[TransportProtocols] = TransportProtocols.OPCUA
    # Explicit, not just inherited via MRO: pull is the default path for
    # every attribute, push is opt-in per attribute (push_is_opt_in below).
    transport_type: ClassVar[TransportType] = TransportType.PULL
    push_is_opt_in: ClassVar[bool] = True
    _config_builder = OpcuaTransportConfig
    address_builder = OpcuaAddress
    config: OpcuaTransportConfig
    _client: Client | None
    _subscription: Subscription | None
    _serialize_reads = False

    def __init__(
        self, metadata: TransportMetadata, config: OpcuaTransportConfig
    ) -> None:
        self._client = None
        # One Subscription per session; one MonitoredItem per listened NodeId,
        # keyed by canonical address id (OpcuaAddress.id / .topic).
        self._subscription = None
        self._monitored_items: dict[str, int] = {}
        self._next_client_handle = itertools.count(1)
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
                    self._establish_session(client),
                    timeout=self.config.connect_timeout,
                )
            except Exception as e:
                # A failed/timed-out connect() may still have opened a socket
                # mid-handshake; self._client is only assigned below, so
                # nothing else can clean it up.
                with contextlib.suppress(Exception):
                    await client.disconnect()
                if is_secure_channel_rejection(e):
                    msg = f"Secure channel rejected by {self.config.endpoint_url}: {e}"
                    raise OpcuaSecurityError(msg) from e
                raise
            self._client = client
            await super().connect()
            await self._resubscribe_all(client)

    async def _establish_session(self, client: Client) -> None:
        """Secure channel setup then session activation, sharing connect_timeout
        so the secure path's extra discovery round-trip stays inside it."""
        if self.config.secure_channel_enabled:
            await apply_security(client, self.config)
        await client.connect()

    async def close(self) -> None:
        # _read_lock is a nullcontext here (_serialize_reads=False), so it
        # doesn't serialize against an in-flight read — only _connection_lock
        # does (see base.py's lock-order note). An in-flight read racing this
        # close() fails with a clean exception rather than hanging or
        # returning a stale/wrong result.
        async with self._read_lock, self._connection_lock:
            if self._subscription is not None:
                # Best-effort: the session (and with it, the subscription) is
                # about to be torn down below regardless.
                with contextlib.suppress(Exception):
                    await self._subscription.delete()
                self._subscription = None
                self._monitored_items.clear()
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

    async def _resubscribe_all(self, client: Client) -> None:
        """Recreate MonitoredItems for every listened address after a
        reconnect — close() clears them but not the ListenerRegistry."""
        address_ids = self._handlers_registry.address_ids()
        if not address_ids:
            return
        subscription = await self._ensure_subscription(client)
        for topic in address_ids:
            try:
                node = client.get_node(topic)
                server_handle = await self._create_monitored_item(subscription, node)
            except Exception:  # noqa: BLE001
                logger.warning(
                    "[Transport %s] failed to resubscribe %s after reconnect",
                    self.id,
                    topic,
                    exc_info=True,
                )
                continue
            self._monitored_items[topic] = server_handle

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
                await self.ensure_connected()
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
            # This path bypasses @connected, which is what parks the state for
            # every other read: without this an unreachable server would report
            # idle forever while every sweep fails.
            self.connection_state = TransportConnectionState.connection_error(str(e))
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

    @connected
    async def register_listener(self, topic: str, callback: ListenerCallback) -> str:
        # Holds _connection_lock for the whole call, like close()/connect() —
        # a reconnect racing an in-flight subscribe must not let this write
        # a _monitored_items entry for an already-torn-down subscription.
        async with self._connection_lock:
            client = self._require_client()
            if topic not in self._monitored_items:
                # Parsed before creating a subscription — a malformed topic
                # must not leave one dangling, unused, on the server.
                node = client.get_node(topic)
                subscription = await self._ensure_subscription(client)
                try:
                    server_handle = await self._create_monitored_item(
                        subscription, node
                    )
                except Exception:
                    # Best-effort: delete() failing must not shadow the
                    # original error (e.g. BadNodeIdUnknown).
                    if not self._monitored_items:
                        with contextlib.suppress(Exception):
                            await subscription.delete()
                        self._subscription = None
                    raise
                self._monitored_items[topic] = server_handle
            return self._handlers_registry.register(topic, callback)

    @connected
    async def unregister_listener(
        self, callback_id: str, topic: str | None = None
    ) -> None:
        self._handlers_registry.remove(callback_id, topic)
        if topic is None:
            return
        async with self._connection_lock:
            if self._subscription is None:
                return
            if self._handlers_registry.get_by_address_id(topic):
                return  # other listeners remain on this NodeId
            server_handle = self._monitored_items.pop(topic, None)
            if server_handle is not None:
                await self._subscription.unsubscribe(server_handle)
            if not self._monitored_items:
                # Best-effort: delete() failing must not block cleanup.
                with contextlib.suppress(Exception):
                    await self._subscription.delete()
                self._subscription = None

    async def _ensure_subscription(self, client: Client) -> Subscription:
        # is_deleted guards against a dangling deleted Subscription, which
        # would otherwise fail every create_monitored_items forever.
        if self._subscription is None or self._subscription.is_deleted:
            self._subscription = await client.create_subscription(
                self.config.sampling_interval_ms, self
            )
        return self._subscription

    async def _create_monitored_item(
        self, subscription: Subscription, node: Node
    ) -> int:
        read_value_id = ua.ReadValueId()
        read_value_id.NodeId = node.nodeid
        read_value_id.AttributeId = ua.AttributeIds.Value
        monitoring_params = ua.MonitoringParameters()
        monitoring_params.ClientHandle = next(self._next_client_handle)
        monitoring_params.SamplingInterval = self.config.sampling_interval_ms
        monitoring_params.QueueSize = 0
        monitoring_params.DiscardOldest = True
        monitoring_params.Filter = self._deadband_filter()
        request = ua.MonitoredItemCreateRequest()
        request.ItemToMonitor = read_value_id
        request.MonitoringMode = ua.MonitoringMode.Reporting
        request.RequestedParameters = monitoring_params
        [result] = await subscription.create_monitored_items([request])
        if isinstance(result, int):
            return result
        # Raises a typed ua.UaStatusCodeError, e.g. for an unknown NodeId;
        # create_monitored_items only stores a StatusCode here for Bad ones,
        # so this fallthrough is unreachable — guard for type-narrowing only.
        result.check()
        msg = f"Unexpected Good StatusCode in monitored-item failure path: {result}"
        raise ua.uaerrors.UaError(msg)

    def _deadband_filter(self) -> ua.DataChangeFilter:
        deadband_filter = ua.DataChangeFilter()
        deadband_filter.Trigger = ua.DataChangeTrigger.StatusValue
        deadband_filter.DeadbandType = (
            ua.DeadbandType.Absolute if self.config.deadband else ua.DeadbandType.None_
        )
        deadband_filter.DeadbandValue = self.config.deadband
        return deadband_filter

    def datachange_notification(
        self,
        node: Node,
        val: object,  # noqa: ARG002 — ignored, decoded from `data` below instead
        data: DataChangeNotif,
    ) -> None:
        """asyncua's subscription callback hook. Unlike the poll path, only a
        Bad status drops the value — Uncertain is still usable."""
        address_id = OpcuaAddress.from_node_id(node.nodeid).id
        status = data.monitored_item.Value.StatusCode
        if status is not None and status.is_bad():
            logger.warning(
                "[Transport %s] dropped bad-quality datachange for %s (%s)",
                self.id,
                address_id,
                status.name,
            )
            return
        raw_value = data.monitored_item.Value.Value
        if raw_value is None:
            logger.warning(
                "[Transport %s] datachange notification for %s carried no value",
                self.id,
                address_id,
            )
            return
        try:
            value = decode_variant(raw_value)
        except Exception:  # noqa: BLE001
            logger.warning(
                "[Transport %s] failed to decode datachange notification for %s",
                self.id,
                address_id,
                exc_info=True,
            )
            return
        for callback in self._handlers_registry.get_by_address_id(address_id):
            try:
                callback(value)
            except Exception:  # noqa: BLE001
                logger.warning(
                    "[Transport %s] listener callback raised for %s",
                    self.id,
                    address_id,
                    exc_info=True,
                )
