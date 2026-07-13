import asyncio
import contextlib

from bacpypes3.apdu import (
    AbortPDU,
    Error,
    ReadPropertyACK,
    ReadPropertyRequest,
    RejectPDU,
    SimpleAckPDU,
    WritePropertyRequest,
)
from bacpypes3.basetypes import BinaryPV
from bacpypes3.constructeddata import AnyAtomic
from bacpypes3.ipv4.app import ForeignApplication, NormalApplication
from bacpypes3.pdu import Address, IPv4Address
from bacpypes3.primitivedata import (
    Atomic,
    ObjectIdentifier,
    Real,
    Unsigned,
)

from devices_manager.core.transports.base import PullTransportClient
from devices_manager.core.transports.connected import connected
from devices_manager.core.transports.transport_metadata import TransportMetadata
from devices_manager.types import AttributeValueType, TransportProtocols

from .application import make_local_application
from .bacnet_address import BacnetAddress
from .bacnet_types import BacnetObjectType
from .transport_config import BacnetTransportConfig


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


class BacnetTransportClient(PullTransportClient[BacnetAddress]):
    protocol = TransportProtocols.BACNET
    _config_builder = BacnetTransportConfig
    address_builder = BacnetAddress
    config: BacnetTransportConfig
    _application: NormalApplication | ForeignApplication
    _known_devices: DevicesDict
    _serialize_reads = True

    def __init__(
        self, metadata: TransportMetadata, config: BacnetTransportConfig
    ) -> None:
        self.config = config
        self._known_devices = {}
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
        async with self._connection_lock:
            self._known_devices = {}
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
        for i_am in i_ams:
            with contextlib.suppress(Exception):
                discovered_devices[i_am.iAmDeviceIdentifier] = i_am.pduSource
        return discovered_devices

    def _device_address(self, address: BacnetAddress) -> Address:
        device_address = self._known_devices.get(
            get_device_identifier(address.device_instance)
        )
        if not device_address:
            msg = f"Bacnet device instance {address.device_instance} not found"
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
        return to_native(response.propertyValue.cast_out(AnyAtomic).get_value())

    async def _read(self, address: BacnetAddress) -> AttributeValueType:
        return await self._read_bacnet(address)

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

        # BACnet Error APDU (e.g. invalid-data-type, not-writable, etc.)
        if isinstance(response, Error):
            msg = (
                f"BACnet error on write-property to {obj_id} {address.property_name}: "
                f"{response.errorClass}:{response.errorCode}"
            )
            raise RuntimeError(msg)  # noqa: TRY004

        # Local device rejected the APDU (syntax, missing fields, etc.)
        if isinstance(response, RejectPDU):
            msg = (
                f"BACnet reject on write-property to {obj_id} {address.property_name}: "
                f"rejectReason={response.rejectReason}"  # ty: ignore[unresolved-attribute]
            )
            raise RuntimeError(msg)  # noqa: TRY004

        # Abort (e.g. segmentation, resources, etc.)
        if isinstance(response, AbortPDU):
            msg = (
                f"BACnet abort on write-property to {obj_id} {address.property_name}: "
                f"abortReason={response.abortReason}, "  # ty: ignore[unresolved-attribute]
                f"apduAbortReject={response.apduAbortReject}"  # ty: ignore[unresolved-attribute]
            )
            raise RuntimeError(msg)  # noqa: TRY004

        msg = f"Unexpected response to WritePropertyRequest: {response!r}"
        raise TypeError(msg)

    async def write(
        self,
        address: BacnetAddress,
        value: AttributeValueType,
    ) -> None:
        """Write a value to the transport."""

        await self._write_bacnet(address, value)
