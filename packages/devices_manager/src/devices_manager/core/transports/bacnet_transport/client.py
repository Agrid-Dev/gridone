import asyncio
import contextlib
import logging
from collections.abc import AsyncGenerator, Iterable

from bacpypes3.apdu import (
    APDU,
    AbortPDU,
    Error,
    ReadPropertyACK,
    ReadPropertyMultipleACK,
    ReadPropertyMultipleRequest,
    ReadPropertyRequest,
    RejectPDU,
    SimpleAckPDU,
    WritePropertyRequest,
)
from bacpypes3.basetypes import BinaryPV
from bacpypes3.ipv4.app import ForeignApplication, NormalApplication
from bacpypes3.pdu import Address, IPv4Address
from bacpypes3.primitivedata import (
    Atomic,
    ObjectIdentifier,
    Real,
    Unsigned,
)

from devices_manager.core.transports.base import PullTransportClient, dedupe_addresses
from devices_manager.core.transports.batch_read import read_results
from devices_manager.core.transports.connected import connected
from devices_manager.core.transports.io_timing import timed_io
from devices_manager.core.transports.read_result import ReadError, ReadOk, ReadResult
from devices_manager.core.transports.transport_metadata import TransportMetadata
from devices_manager.types import AttributeValueType, TransportProtocols

from .application import make_local_application
from .bacnet_address import BacnetAddress
from .bacnet_types import BacnetObjectType
from .responses import BacnetRequestTooLargeError, raise_for_response
from .rpm_decode import decode_property_value, decode_rpm
from .rpm_plan import RpmRequest, plan_rpm
from .transport_config import BacnetTransportConfig

logger = logging.getLogger(__name__)

# Floor for the per-device RPM chunk-size shrink-and-retry (see
# _read_device_rpm): below this fraction of the device's Max-APDU, further
# shrinking isn't worth it and RPM is disabled for the device instead.
MIN_RPM_REQUEST_APDU_FRACTION = 0.05


def get_device_identifier(device_instance: int) -> ObjectIdentifier:
    return ObjectIdentifier(f"device,{device_instance}")


_ANALOG_OBJECT_TYPES = frozenset(
    {
        BacnetObjectType.ANALOG_INPUT,
        BacnetObjectType.ANALOG_OUTPUT,
        BacnetObjectType.ANALOG_VALUE,
    }
)
_BINARY_OBJECT_TYPES = frozenset(
    {
        BacnetObjectType.BINARY_INPUT,
        BacnetObjectType.BINARY_OUTPUT,
        BacnetObjectType.BINARY_VALUE,
    }
)
_MULTISTATE_OBJECT_TYPES = frozenset(
    {
        BacnetObjectType.MULTISTATE_INPUT,
        BacnetObjectType.MULTISTATE_OUTPUT,
        BacnetObjectType.MULTISTATE_VALUE,
    }
)


def encode_present_value(
    object_type: BacnetObjectType, value: AttributeValueType
) -> Atomic:
    """Encode a value as the BACnet datatype the object type's present-value uses.

    Each object type fixes the datatype of its present-value: Real for analog,
    BinaryPV for binary, Unsigned for multi-state. Encoding by object type (not
    by the Python value's type) is what a device expects — a multi-state
    present-value is an Unsigned, not a Signed integer.
    """
    if object_type in _ANALOG_OBJECT_TYPES:
        return Real(float(value))
    if object_type in _BINARY_OBJECT_TYPES:
        return BinaryPV(1 if value else 0)
    if object_type in _MULTISTATE_OBJECT_TYPES:
        return Unsigned(int(value))
    msg = f"Cannot encode a write value for object type {object_type}"
    raise ValueError(msg)


type DevicesDict = dict[ObjectIdentifier, Address]


class BacnetTransportClient(PullTransportClient[BacnetAddress]):
    protocol = TransportProtocols.BACNET
    _config_builder = BacnetTransportConfig
    address_builder = BacnetAddress
    config: BacnetTransportConfig
    _application: NormalApplication | ForeignApplication
    _known_devices: DevicesDict
    _device_max_apdu: dict[int, int]
    _rpm_supported: dict[int, bool]
    _rpm_fraction_override: dict[int, float]
    _serialize_reads = True

    def __init__(
        self, metadata: TransportMetadata, config: BacnetTransportConfig
    ) -> None:
        self.config = config
        self._known_devices = {}
        self._device_max_apdu = {}
        self._rpm_supported = {}
        self._rpm_fraction_override = {}
        super().__init__(metadata, config)

    async def connect(self) -> None:
        async with self._connection_lock:
            # Concurrent first-polls each hit @connected and race into connect();
            # bail if another caller already connected so we bind exactly one
            # Application (otherwise N stacks bind :47808 and replies scatter).
            if self.connection_state.is_connected:
                return
            # Never leak a previously bound socket on reconnect.
            if getattr(self, "_application", None):
                self._application.close()
            self._application = make_local_application(self.config)
            if self.config.bbmd_address:
                self._register_foreign_device()
            self._known_devices = await self._discover_devices()
            await super().connect()

    async def close(self) -> None:
        # Lock order: see TransportClient._read_lock in base.py.
        async with self._read_lock, self._connection_lock:
            self._known_devices = {}
            self._device_max_apdu = {}
            self._rpm_supported = {}
            self._rpm_fraction_override = {}
            if hasattr(self, "_application") and self._application:
                self._application.close()
            await super().close()

    def _register_foreign_device(self) -> None:
        """Register with a BBMD so broadcasts reach us behind NAT (containers)."""
        bbmd = IPv4Address(f"{self.config.bbmd_address}:{self.config.port}")
        self._application.register(bbmd, self.config.foreign_ttl)  # ty: ignore[unresolved-attribute]

    async def _discover_devices(self) -> DevicesDict:
        """Discover devices and bind them to their (routed) addresses via I-Am.

        Binding is required to talk to devices behind a router/gateway — a
        manually built remote address has no bound source. A directed Who-Is to
        `discovery_address` works across a Docker bridge; otherwise broadcast
        (which needs host networking or a BBMD registration to reach the LAN).
        """
        if self.config.discovery_address:
            who_is = self._application.who_is(
                address=Address(f"{self.config.discovery_address}:{self.config.port}")
            )
        else:
            who_is = self._application.who_is()
        i_ams = await asyncio.wait_for(who_is, timeout=self.config.discovery_timeout)
        discovered_devices: DevicesDict = {}
        discovered_max_apdu: dict[int, int] = {}
        for i_am in i_ams:
            with contextlib.suppress(Exception):
                discovered_devices[i_am.iAmDeviceIdentifier] = i_am.pduSource
                discovered_max_apdu[i_am.iAmDeviceIdentifier[1]] = int(
                    i_am.maxAPDULengthAccepted
                )
        self._device_max_apdu = discovered_max_apdu
        return discovered_devices

    def _device_address(self, address: BacnetAddress) -> Address:
        return self._device_address_for_instance(address.device_instance)

    def _device_address_for_instance(self, device_instance: int) -> Address:
        device_address = self._known_devices.get(get_device_identifier(device_instance))
        if not device_address:
            msg = f"Bacnet device instance {device_instance} not found"
            raise KeyError(msg)
        return device_address

    async def _request(
        self, request: APDU, *, target: str, action: str, request_timeout: float
    ) -> APDU | None:
        """Send a confirmed-service request, normalizing bacpypes3's two
        delivery paths for Error/RejectPDU/AbortPDU — returned, or raised as
        a ``BaseException`` that ``except Exception`` won't catch — into one:
        callers only ever see the ACK they asked for, or an already-
        classified normal exception.
        """
        try:
            return await asyncio.wait_for(
                self._application.request(request), timeout=request_timeout
            )
        except (Error, RejectPDU, AbortPDU) as e:
            return raise_for_response(e, target=target, action=action)

    @connected
    async def _read_bacnet(self, address: BacnetAddress) -> AttributeValueType:
        obj_id = ObjectIdentifier(f"{address.object_type},{address.object_instance}")
        request = ReadPropertyRequest(
            objectIdentifier=obj_id,
            propertyIdentifier=address.property_name,
        )
        request.pduDestination = self._device_address(address)
        target = f"{obj_id} {address.property_name}"
        response = await self._request(
            request,
            target=target,
            action="read-property",
            request_timeout=self.config.read_property_timeout,
        )
        if isinstance(response, ReadPropertyACK):
            return decode_property_value(response.propertyValue)
        return raise_for_response(response, target=target, action="read-property")

    async def _read(self, address: BacnetAddress) -> AttributeValueType:
        return await self._read_bacnet(address)

    @connected
    async def _read_rpm(self, rpm_request: RpmRequest) -> ReadPropertyMultipleACK:
        request = ReadPropertyMultipleRequest(
            listOfReadAccessSpecs=list(rpm_request.specs)
        )
        request.pduDestination = self._device_address_for_instance(
            rpm_request.device_instance
        )
        target = f"device {rpm_request.device_instance}"
        response = await self._request(
            request,
            target=target,
            action="read-property-multiple",
            request_timeout=self.config.read_property_timeout,
        )
        if isinstance(response, ReadPropertyMultipleACK):
            return response
        return raise_for_response(
            response, target=target, action="read-property-multiple"
        )

    async def _read_rpm_request(
        self, rpm_request: RpmRequest, sweep_id: str | None
    ) -> list[ReadResult] | None:
        """Issue one RPM request and split its ACK into a result per address.

        Raises :class:`BacnetRequestTooLargeError` for the caller to retry
        with a smaller chunk. Any other failure — rejection, silent timeout,
        decode error — marks the device RPM-unsupported (one strike, reset on
        reconnect) and returns ``None`` so the caller falls back to
        per-property reads.

        The lock covers the transaction only, so one long RPM sweep can't
        starve another read.
        """
        async with self._read_lock:
            try:
                async with timed_io(self.id, self.protocol, len(rpm_request.addresses)):
                    ack = await self._read_rpm(rpm_request)
                    values = decode_rpm(rpm_request, ack)
            except BacnetRequestTooLargeError:
                raise
            except Exception as e:  # noqa: BLE001
                logger.warning(
                    "[Transport %s] device %d does not support "
                    "ReadPropertyMultiple — falling back to per-property "
                    "reads (%s: %s)",
                    self.id,
                    rpm_request.device_instance,
                    type(e).__name__,
                    e,
                )
                self._rpm_supported[rpm_request.device_instance] = False
                return None
            if sweep_id is not None:
                for address, value in values:
                    if not isinstance(value, Exception):
                        self._sweep_memo.remember(address.id, sweep_id, value)
                        self._sweep_memo.record(hit=False)
        return [
            ReadError(address.id, value)
            if isinstance(value, Exception)
            else ReadOk(address.id, value)
            for address, value in values
        ]

    def _fallback_read(
        self, addresses: Iterable[BacnetAddress], sweep_id: str | None
    ) -> AsyncGenerator[ReadResult]:
        """Per-property ReadProperty fallback for addresses not using RPM.
        Goes through the base :meth:`read`, so it's isolated per address,
        memoized, and timed like any other single read."""
        return read_results(
            addresses,
            lambda a: self.read(a, sweep_id),
            concurrent=not self._serialize_reads,
        )

    @staticmethod
    def _shrunk_rpm_fraction(fraction: float) -> float | None:
        """Halve ``fraction``, or ``None`` if already at
        :data:`MIN_RPM_REQUEST_APDU_FRACTION` (caller should disable RPM for
        the device instead of shrinking further)."""
        smaller = max(fraction / 2, MIN_RPM_REQUEST_APDU_FRACTION)
        return None if smaller >= fraction else smaller

    async def _read_rpm_chunk(
        self,
        device_instance: int,
        rpm_request: RpmRequest,
        fraction: float,
        sweep_id: str | None,
    ) -> tuple[list[ReadResult] | None, list[BacnetAddress]]:
        """Issue one RPM chunk. Returns ``(results, retry_addresses)``:
        normally ``retry_addresses`` is empty and ``results`` carries the
        outcome (see :meth:`_read_rpm_request`). On
        :class:`BacnetRequestTooLargeError`, either ``retry_addresses`` holds
        the chunk to replan at a smaller fraction, or — at the fraction floor
        — RPM is disabled for the device and it's returned as an ordinary
        ``None`` failure instead.
        """
        try:
            return await self._read_rpm_request(rpm_request, sweep_id), []
        except BacnetRequestTooLargeError:
            smaller = self._shrunk_rpm_fraction(fraction)
            if smaller is None:
                logger.warning(
                    "[Transport %s] device %d: RPM chunk still too large at "
                    "the fraction floor (%.3f) — disabling RPM for the "
                    "device",
                    self.id,
                    device_instance,
                    fraction,
                )
                self._rpm_supported[device_instance] = False
                return None, []
            self._rpm_fraction_override[device_instance] = smaller
            logger.debug(
                "[Transport %s] device %d: RPM chunk too large "
                "(fraction=%.3f) — retrying at fraction=%.3f",
                self.id,
                device_instance,
                fraction,
                smaller,
            )
            return None, list(rpm_request.addresses)

    async def _read_device_rpm(
        self,
        device_instance: int,
        addresses: list[BacnetAddress],
        sweep_id: str | None,
    ) -> AsyncGenerator[ReadResult]:
        """Plan and issue RPM requests for one device, shrinking the chunk
        size and replanning on :class:`BacnetRequestTooLargeError` instead of
        treating an oversized chunk as "RPM unsupported". The shrunk fraction
        is cached per device so later chunks start from it. Below
        :data:`MIN_RPM_REQUEST_APDU_FRACTION`, RPM is disabled for the device
        instead, same as any other one-strike failure.
        """
        pending = addresses
        while pending:
            fraction = self._rpm_fraction_override.get(
                device_instance, self.config.rpm_request_apdu_fraction
            )
            requests = plan_rpm(
                pending,
                max_apdu_by_device=self._device_max_apdu,
                request_apdu_fraction=fraction,
            )
            if requests:
                logger.debug(
                    "[Transport %s] device %d: %d address(es) coalesced into "
                    "%d ReadPropertyMultiple request(s) (fraction=%.3f)",
                    self.id,
                    device_instance,
                    len(pending),
                    len(requests),
                    fraction,
                )
            pending = []
            for rpm_request in requests:
                # A rejection on an earlier chunk of this same sweep already
                # disabled RPM for the device — later chunks skip straight to
                # the fallback instead of re-attempting a service just
                # proven unsupported.
                if not self._rpm_supported.get(device_instance, True):
                    async for result in self._fallback_read(
                        rpm_request.addresses, sweep_id
                    ):
                        yield result
                    continue
                results, retry_addresses = await self._read_rpm_chunk(
                    device_instance, rpm_request, fraction, sweep_id
                )
                if retry_addresses:
                    pending.extend(retry_addresses)
                    continue
                if results is None:
                    async for result in self._fallback_read(
                        rpm_request.addresses, sweep_id
                    ):
                        yield result
                    continue
                for result in results:
                    yield result

    async def read_many(
        self,
        addresses: list[BacnetAddress],
        sweep_id: str | None = None,
    ) -> AsyncGenerator[ReadResult]:
        """Read addresses as coalesced ReadPropertyMultiple requests, one per
        device's Max-APDU-sized chunk (see :meth:`_read_rpm_request` for the
        RPM-support fallback policy). Bypasses the base :meth:`read`, so it
        consults/populates ``self._sweep_memo`` directly to stay coalesced
        with any reads sharing this sweep. ``config.rpm_enabled`` is
        snapshotted once per sweep so a mid-sweep config patch can't split
        one sweep between RPM and forced-fallback devices.
        """
        rpm_enabled = self.config.rpm_enabled
        if not rpm_enabled:
            logger.debug(
                "[Transport %s] rpm_enabled=False — forcing per-property "
                "ReadProperty for %d address(es)",
                self.id,
                len(addresses),
            )
        pending: list[BacnetAddress] = []
        for address in dedupe_addresses(addresses).values():
            cached = (
                self._sweep_memo.recall(address.id, sweep_id)
                if sweep_id is not None
                else None
            )
            if cached is None:
                pending.append(address)
            else:
                self._sweep_memo.record(hit=True)
                yield ReadOk(address.id, cached)

        by_device: dict[int, list[BacnetAddress]] = {}
        for address in pending:
            by_device.setdefault(address.device_instance, []).append(address)

        for device_instance, device_addresses in by_device.items():
            if rpm_enabled and self._rpm_supported.get(device_instance, True):
                async for result in self._read_device_rpm(
                    device_instance, device_addresses, sweep_id
                ):
                    yield result
            else:
                async for result in self._fallback_read(device_addresses, sweep_id):
                    yield result

    @connected
    async def _write_bacnet(
        self, address: BacnetAddress, value: AttributeValueType
    ) -> None:
        obj_id = ObjectIdentifier(f"{address.object_type},{address.object_instance}")
        property_value = encode_present_value(address.object_type, value)

        request = WritePropertyRequest(
            objectIdentifier=obj_id,
            propertyIdentifier=address.property_name,
            propertyValue=property_value,
            priority=address.write_priority or self.config.default_write_priority,
        )
        request.pduDestination = self._device_address(address)
        target = f"{obj_id} {address.property_name}"
        response = await self._request(
            request,
            target=target,
            action="write-property",
            request_timeout=self.config.write_property_timeout,
        )

        if isinstance(response, SimpleAckPDU):
            return
        raise_for_response(response, target=target, action="write-property")

    async def write(
        self,
        address: BacnetAddress,
        value: AttributeValueType,
    ) -> None:
        """Write a value to the transport."""

        await self._write_bacnet(address, value)
