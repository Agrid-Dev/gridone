from core.types import AttributeValueType, DeviceConfig

from .base import TransportClient, TransportProtocols


class HTTPTransportClient(TransportClient):
    protocol = TransportProtocols.HTTP

    async def read(
        self,
        address: str,
        device_config: DeviceConfig,
    ) -> AttributeValueType:
        print(f"Reading via HTTP from {address} with config {device_config}")
        return 25  # Placeholder return value

    async def write(
        self,
        address: str,
        value: AttributeValueType,
        device_config: DeviceConfig,
    ) -> None:
        print(
            f"Writing via HTTP to {address} with value {value}",
        )
