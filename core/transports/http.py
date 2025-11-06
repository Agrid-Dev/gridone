from core.types import AttributeValueType, DeviceConfig
from core.value_parsers import ValueParser

from .base import TransportClient, TransportProtocols


class HTTPTransportClient(TransportClient):
    protocol = TransportProtocols.HTTP

    async def read(
        self,
        address: str,
        device_config: DeviceConfig,
        value_parser: ValueParser | None = None,
    ) -> AttributeValueType:
        print(f"Reading via HTTP from {address} with config {device_config}")  # noqa: T201
        mock_result = {
            "current_weather": {
                "temperature": 22.5,
            },
        }
        if value_parser is not None:
            return value_parser(mock_result)
        return mock_result

    async def write(
        self,
        address: str,
        value: AttributeValueType,
        device_config: DeviceConfig,
    ) -> None:
        print(
            f"Writing via HTTP to {address} with value {value}",
        )
