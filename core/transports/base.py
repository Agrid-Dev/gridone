from typing import ClassVar, Protocol, runtime_checkable

from core.types import AttributeValueType, DeviceConfig, TransportProtocols


# Abstract base for transport clients
@runtime_checkable
class TransportClient(Protocol):
    protocol: ClassVar[TransportProtocols]

    async def read(
        self,
        address: str,
        device_config: DeviceConfig,
    ) -> AttributeValueType: ...
    async def write(
        self,
        address: str,
        value: AttributeValueType,
        device_config: DeviceConfig,
    ) -> None: ...
