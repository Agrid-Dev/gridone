import asyncio

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
from bacpypes3.ipv4.app import NormalApplication
from bacpypes3.pdu import Address
from bacpypes3.primitivedata import (
    CharacterString,
    Integer,
    ObjectIdentifier,
    Real,
)

from core.transports.base import TransportClient
from core.transports.connected import connected
from core.types import AttributeValueType, TransportProtocols

from .application import make_local_application
from .bacnet_address import BacnetAddress
from .transport_config import BacnetTransportConfig


def get_device_identifier(device_instance: int) -> ObjectIdentifier:
    return ObjectIdentifier(f"device,{device_instance}")


type DevicesDict = dict[ObjectIdentifier, Address]


class BacnetTransportClient(TransportClient[BacnetAddress]):
    protocol = TransportProtocols.BACNET
    address_builder = BacnetAddress
    config: BacnetTransportConfig
    _application: NormalApplication
    _known_devices: DevicesDict

    def __init__(self, config: BacnetTransportConfig) -> None:
        self.config = config
        self._application = make_local_application(self.config)
        self._known_devices = {}
        super().__init__()

    async def discover_devices(self) -> DevicesDict:
        i_ams = await asyncio.wait_for(
            self._application.who_is(),
            timeout=self.config.discovery_timeout,
        )
        discovered_devices: DevicesDict = {}
        for i_am in i_ams:
            try:
                device_address: Address = i_am.pduSource
                device_identifier: ObjectIdentifier = i_am.iAmDeviceIdentifier
                discovered_devices[device_identifier] = device_address
            except Exception:  # noqa: S110,BLE001
                pass
        return discovered_devices

    async def connect(self) -> None:
        async with self._connection_lock:
            discovered_devices = await self.discover_devices()
            self._known_devices = discovered_devices
            await super().connect()

    async def close(self) -> None:
        async with self._connection_lock:
            self._known_devices = {}
            self._application.close()
            await super().close()

    @connected
    async def _read_bacnet(self, address: BacnetAddress) -> AttributeValueType:
        device_identifier = get_device_identifier(address.device_instance)
        device_address = self._known_devices.get(device_identifier)
        if not device_address:
            msg = f"Bacnet device instance {address.device_instance} not found"
            raise KeyError(msg)
        obj_id = ObjectIdentifier(f"{address.object_type},{address.object_instance}")
        request = ReadPropertyRequest(
            objectIdentifier=obj_id,
            propertyIdentifier=address.property_name,
        )
        request.pduDestination = device_address
        response = await asyncio.wait_for(
            self._application.request(request),
            timeout=self.config.read_property_timeout,
        )
        if not isinstance(response, ReadPropertyACK):
            msg = f"Unexpected response: {response!r}"
            raise TypeError(msg)
        return response.propertyValue.cast_out(AnyAtomic).get_value()

    async def read(self, address: BacnetAddress) -> AttributeValueType:
        """Read a value from the transport."""

        return await self._read_bacnet(address)

    @connected
    async def _write_bacnet(
        self, address: BacnetAddress, value: AttributeValueType
    ) -> None:
        device_identifier = get_device_identifier(address.device_instance)
        device_address = self._known_devices.get(device_identifier)
        if not device_address:
            msg = f"Bacnet device instance {address.device_instance} not found"
            raise KeyError(msg)
        obj_id = ObjectIdentifier(f"{address.object_type},{address.object_instance}")
        if isinstance(value, bool):
            value = BinaryPV(value)
        elif isinstance(value, int):
            value = Integer(value)
        elif isinstance(value, float):
            value = Real(value)
        elif isinstance(value, str):
            value = CharacterString(value)
        else:
            msg = f"Unsupported value type: {type(value)}"
            raise TypeError(msg)

        request = WritePropertyRequest(
            objectIdentifier=obj_id,
            propertyIdentifier=address.property_name,
            propertyValue=value,
            priority=address.write_priority or self.config.default_write_priority,
        )
        request.pduDestination = device_address
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
                f"rejectReason={response.rejectReason}"
            )
            raise RuntimeError(msg)  # noqa: TRY004

        # Abort (e.g. segmentation, resources, etc.)
        if isinstance(response, AbortPDU):
            msg = (
                f"BACnet abort on write-property to {obj_id} {address.property_name}: "
                f"abortReason={response.abortReason}, "
                f"apduAbortReject={response.apduAbortReject}"
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
