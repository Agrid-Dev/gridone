from dataclasses import dataclass

from core.types import AttributeValueType, DeviceConfig, TransportProtocols

from .device_schema import DeviceSchema
from .transports import TransportClient, get_transport_client


@dataclass
class Driver:
    transport: TransportClient
    schema: DeviceSchema

    async def read_value(
        self,
        attribute_name: str,
        device_config: DeviceConfig,
    ) -> AttributeValueType:
        atttibute_schema = self.schema.get_attribute_schema(
            attribute_name=attribute_name,
        )
        return await self.transport.read(
            address=atttibute_schema.protocol_key,
            device_config=device_config,
        )

    @classmethod
    def from_dict(cls, data: dict) -> "Driver":
        transport = data.get("transport")
        if transport is None or transport not in TransportProtocols:
            msg = f"Invalid or missing transport protocol: '{transport}'"
            raise ValueError(msg)
        transport_client = get_transport_client(data["transport"])
        device_schema = DeviceSchema.from_dict(data)
        return cls(
            transport=transport_client,
            schema=device_schema,
        )
