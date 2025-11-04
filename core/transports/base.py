from typing import Protocol, runtime_checkable

from core.device import DeviceConfig
from core.types import DataType, TransportProtocols


# Abstract base for transport clients
@runtime_checkable
class TransportClient(Protocol):
    protocol: TransportProtocols

    async def read(self, address: str, device_config: DeviceConfig) -> DataType: ...
    async def write(
        self,
        address: str,
        value: DataType,
        device_config: DeviceConfig,
    ) -> None: ...
