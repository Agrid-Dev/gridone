import asyncio

from bacpypes3.apdu import ReadPropertyACK, ReadPropertyRequest
from bacpypes3.constructeddata import AnyAtomic
from bacpypes3.ipv4.app import NormalApplication
from bacpypes3.pdu import Address
from bacpypes3.primitivedata import ObjectIdentifier

from core.transports.base import TransportClient
from core.types import AttributeValueType, TransportProtocols
from core.value_parsers import ValueParser

from .application import make_local_application
from .bacnet_address import BacnetAddress
from .transport_config import BacnetTransportConfig


def get_device_identifier(device_instance: int) -> ObjectIdentifier:
    return ObjectIdentifier(f"device,{device_instance}")


type DevicesDict = dict[ObjectIdentifier, Address]


class BacnetTransportClient(TransportClient):
    protocol = TransportProtocols.BACNET
    config: BacnetTransportConfig
    _application: NormalApplication
    _known_devices: DevicesDict

    def __init__(self, config: BacnetTransportConfig) -> None:
        self.config = config
        self._application = make_local_application(self.config)
        self._known_devices = {}

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
        discovered_devices = await self.discover_devices()
        self._known_devices = discovered_devices

    async def close(self) -> None:
        self._known_devices = {}

    async def _read_bacnet(
        self, device_instance: int, address: BacnetAddress
    ) -> AttributeValueType:
        device_identifier = get_device_identifier(device_instance)
        device_address = self._known_devices.get(device_identifier)
        if not device_address:
            msg = f"Bacnet device instance {device_instance} not found"
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

    async def read(
        self,
        address: str | dict,
        value_parser: ValueParser | None = None,
        *,
        context: dict,
    ) -> AttributeValueType:
        """Read a value from the transport."""
        device_instance = context.get("device_instance")
        if not device_instance:
            msg = "Need a device_instance for bacnet"
            raise ValueError(msg)
        device_instance = int(device_instance)
        bacnet_address = BacnetAddress.from_raw(address)
        raw_value = await self._read_bacnet(device_instance, bacnet_address)
        if value_parser:
            return value_parser.parse(raw_value)
        return raw_value

    async def write(
        self,
        address: str | dict,
        value: AttributeValueType,
        *,
        value_parser: ValueParser | None = None,
        context: dict,
    ) -> None:
        """Write a value to the transport."""
        raise NotImplementedError
