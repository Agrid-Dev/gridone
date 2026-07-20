import asyncio
import contextlib
import logging
from collections.abc import AsyncGenerator
from typing import NoReturn

from bacpypes3.apdu import (
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
from bacpypes3.basetypes import BinaryPV, PropertyIdentifier
from bacpypes3.constructeddata import AnyAtomic
from bacpypes3.ipv4.app import ForeignApplication, NormalApplication
from bacpypes3.pdu import Address, IPv4Address
from bacpypes3.primitivedata import (
    Atomic,
    ObjectIdentifier,
    Real,
    Unsigned,
)

from devices_manager.core.transports.base import PullTransportClient, dedupe_addresses
from devices_manager.core.transports.connected import connected
from devices_manager.core.transports.read_result import ReadError, ReadOk, ReadResult
from devices_manager.core.transports.transport_metadata import TransportMetadata
from devices_manager.types import AttributeValueType, TransportProtocols

from .application import make_local_application
from .bacnet_address import BacnetAddress
from .bacnet_types import BacnetObjectType
from .rpm_plan import RpmRequest, plan_rpm
from .transport_config import BacnetTransportConfig

logger = logging.getLogger(__name__)


def get_device_identifier(device_instance: int) -> ObjectIdentifier:
    return ObjectIdentifier(f"device,{device_instance}")


def to_native(value: object) -> AttributeValueType:
    """Convert a bacpypes3 atomic value to a plain Python primitive.

    `get_value()` returns wrappers (Real, Unsigned, Enumerated, ...) that
    subclass float/int/str, so they pass isinstance checks downstream but break
    exact-type lookups (e.g. timeseries `type(value)`). Order matters: bool
    before int, since bool is an int subclass.
    """
    if isinstance(value, bool):
        return value
    if isinstance(value, int):
        return int(value)
    if isinstance(value, float):
        return float(value)
    if isinstance(value, str):
        return str(value)
    return value  # ty: ignore[invalid-return-type]


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


class BacnetServiceRejectedError(RuntimeError):
    """The device rejected the confirmed service itself (RejectPDU/AbortPDU),
    not just one transaction — distinct from ``Error``, which only fails the
    request that carried it."""


def _raise_for_response(response: object, *, target: str, action: str) -> NoReturn:
    """Classify a non-ACK BACnet response and raise accordingly.

    ``Error`` means only this one transaction failed (e.g. one bad
    property). ``RejectPDU``/``AbortPDU`` mean the device rejected the
    confirmed *service* itself (e.g. RPM unrecognized) — raised as
    :class:`BacnetServiceRejectedError` so callers can distinguish "this
    read failed" from "stop attempting this service on this device",
    driving the RPM-support fallback cache in ``_read_rpm_request``.
    """
    if isinstance(response, Error):
        msg = (
            f"BACnet error on {action} to {target}: "
            f"{response.errorClass}:{response.errorCode}"
        )
        raise RuntimeError(msg)  # noqa: TRY004
    if isinstance(response, RejectPDU):
        msg = f"BACnet reject on {action} to {target}: rejectReason={response.reason}"
        raise BacnetServiceRejectedError(msg)
    if isinstance(response, AbortPDU):
        msg = f"BACnet abort on {action} to {target}: abortReason={response.reason}"
        raise BacnetServiceRejectedError(msg)
    msg = f"Unexpected response to {action}: {response!r}"
    raise TypeError(msg)


def _decode_property_value(container: object) -> AttributeValueType:
    """Unwrap a bacpypes3 ``Any``-typed property value into a plain Python
    primitive — the same cast used for both a single ReadProperty ACK and
    one element of a ReadPropertyMultiple ACK."""
    return to_native(container.cast_out(AnyAtomic).get_value())  # ty: ignore[unresolved-attribute]


def _decode_rpm(
    rpm_request: RpmRequest, ack: ReadPropertyMultipleACK
) -> list[tuple[BacnetAddress, AttributeValueType | Exception]]:
    """Split one RPM ACK back into a value or error per member address.

    Every address in ``rpm_request.addresses`` is guaranteed exactly one
    entry in the result: a ``propertyAccessError`` element yields an error
    for that address without failing the others, and an address the ACK
    omits entirely (partial/buggy RPM support) is reported as an error
    rather than silently dropped — the caller must be able to treat "no
    entry" as impossible.
    """
    by_key = {
        (
            ObjectIdentifier(f"{address.object_type},{address.object_instance}"),
            PropertyIdentifier(address.property_name),
        ): address
        for address in rpm_request.addresses
    }
    results: dict[str, tuple[BacnetAddress, AttributeValueType | Exception]] = {
        address.id: (
            address,
            RuntimeError(
                f"BACnet read-property-multiple response for device "
                f"{rpm_request.device_instance} omitted "
                f"{address.object_type}:{address.object_instance} "
                f"{address.property_name}"
            ),
        )
        for address in rpm_request.addresses
    }
    for access_result in ack.listOfReadAccessResults:  # ty: ignore[not-iterable]
        for element in access_result.listOfResults:
            address = by_key.get(
                (access_result.objectIdentifier, element.propertyIdentifier)
            )
            if address is None:
                continue
            choice = element.readResult
            if choice.propertyAccessError is not None:
                error = choice.propertyAccessError
                results[address.id] = (
                    address,
                    RuntimeError(
                        f"BACnet error on read-property-multiple to "
                        f"{access_result.objectIdentifier} "
                        f"{element.propertyIdentifier}: "
                        f"{error.errorClass}:{error.errorCode}"
                    ),
                )
                continue
            value = _decode_property_value(choice.propertyValue)
            results[address.id] = (address, value)
    return list(results.values())


class BacnetTransportClient(PullTransportClient[BacnetAddress]):
    protocol = TransportProtocols.BACNET
    _config_builder = BacnetTransportConfig
    address_builder = BacnetAddress
    config: BacnetTransportConfig
    _application: NormalApplication | ForeignApplication
    _known_devices: DevicesDict
    _device_max_apdu: dict[int, int]
    _rpm_supported: dict[int, bool]
    _serialize_reads = True

    def __init__(
        self, metadata: TransportMetadata, config: BacnetTransportConfig
    ) -> None:
        self.config = config
        self._known_devices = {}
        self._device_max_apdu = {}
        self._rpm_supported = {}
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

    @connected
    async def _read_bacnet(self, address: BacnetAddress) -> AttributeValueType:
        obj_id = ObjectIdentifier(f"{address.object_type},{address.object_instance}")
        request = ReadPropertyRequest(
            objectIdentifier=obj_id,
            propertyIdentifier=address.property_name,
        )
        request.pduDestination = self._device_address(address)
        response = await asyncio.wait_for(
            self._application.request(request),
            timeout=self.config.read_property_timeout,
        )
        if not isinstance(response, ReadPropertyACK):
            msg = f"Unexpected response: {response!r}"
            raise TypeError(msg)
        return _decode_property_value(response.propertyValue)

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
        response = await asyncio.wait_for(
            self._application.request(request),
            timeout=self.config.read_property_timeout,
        )
        if isinstance(response, ReadPropertyMultipleACK):
            return response
        _raise_for_response(
            response,
            target=f"device {rpm_request.device_instance}",
            action="read-property-multiple",
        )

    async def _read_rpm_request(
        self, rpm_request: RpmRequest, correlation_id: str | None
    ) -> list[ReadResult] | None:
        """Issue one RPM request and split its ACK into a result per address.

        Returns ``None`` when the device doesn't support the service —
        either it rejected it outright (``BacnetServiceRejectedError``) or
        it never responded at all (``TimeoutError``: some devices signal an
        unsupported service by silently dropping the request rather than
        sending a proper Reject/Abort) — the caller falls back to
        per-property reads for this request's addresses. Any other failure
        marks every member address failed, mirroring Modbus's per-block
        isolation.

        The lock is held for the transaction only, then released before
        results are handed on, so one long RPM sweep cannot starve another
        read.
        """
        async with self._read_lock:
            epoch = self._cache_epoch
            try:
                ack = await self._read_rpm(rpm_request)
                values = _decode_rpm(rpm_request, ack)
            except (BacnetServiceRejectedError, TimeoutError) as e:
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
            except Exception as e:  # noqa: BLE001
                logger.warning(
                    "[Transport %s] RPM request for device %d failed — %s: %s",
                    self.id,
                    rpm_request.device_instance,
                    type(e).__name__,
                    e,
                )
                return [ReadError(address.id, e) for address in rpm_request.addresses]
            for address, value in values:
                if not isinstance(value, Exception):
                    self._cache_put(address, correlation_id, value, epoch)
        return [
            ReadError(address.id, value)
            if isinstance(value, Exception)
            else ReadOk(address.id, value)
            for address, value in values
        ]

    async def _read_device_rpm(
        self,
        device_instance: int,
        addresses: list[BacnetAddress],
        correlation_id: str | None,
    ) -> AsyncGenerator[ReadResult]:
        requests = plan_rpm(
            addresses,
            max_apdu_by_device=self._device_max_apdu,
            request_apdu_fraction=self.config.rpm_request_apdu_fraction,
        )
        if requests:
            logger.debug(
                "[Transport %s] device %d: %d address(es) coalesced into %d "
                "ReadPropertyMultiple request(s)",
                self.id,
                device_instance,
                len(addresses),
                len(requests),
            )
        for rpm_request in requests:
            # A rejection on an earlier chunk of this same sweep already
            # disabled RPM for the device — later chunks skip straight to
            # the fallback instead of re-attempting a service just proven
            # unsupported.
            if not self._rpm_supported.get(device_instance, True):
                for address in rpm_request.addresses:
                    yield await self._read_one(address, correlation_id)
                continue
            results = await self._read_rpm_request(rpm_request, correlation_id)
            if results is None:
                for address in rpm_request.addresses:
                    yield await self._read_one(address, correlation_id)
                continue
            for result in results:
                yield result

    async def read_many(
        self,
        addresses: list[BacnetAddress],
        correlation_id: str | None = None,
    ) -> AsyncGenerator[ReadResult]:
        """Read addresses as coalesced ReadPropertyMultiple requests, one per
        device instance's Max-APDU-sized chunk. A device that has already
        shown (RejectPDU/AbortPDU, or simply never responding) it doesn't
        support RPM falls back to sequential ReadProperty for the rest of
        the session.
        """
        pending: list[BacnetAddress] = []
        for address in dedupe_addresses(addresses).values():
            cached = self._cache_get(address, correlation_id)
            if cached is None:
                pending.append(address)
            else:
                yield ReadOk(address.id, cached)

        by_device: dict[int, list[BacnetAddress]] = {}
        for address in pending:
            by_device.setdefault(address.device_instance, []).append(address)

        for device_instance, device_addresses in by_device.items():
            if self._rpm_supported.get(device_instance, True):
                async for result in self._read_device_rpm(
                    device_instance, device_addresses, correlation_id
                ):
                    yield result
            else:
                for address in device_addresses:
                    yield await self._read_one(address, correlation_id)

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
        response = await asyncio.wait_for(
            self._application.request(request),
            timeout=self.config.write_property_timeout,
        )

        if isinstance(response, SimpleAckPDU):
            return
        _raise_for_response(
            response,
            target=f"{obj_id} {address.property_name}",
            action="write-property",
        )

    async def write(
        self,
        address: BacnetAddress,
        value: AttributeValueType,
    ) -> None:
        """Write a value to the transport."""

        await self._write_bacnet(address, value)
