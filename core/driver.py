from dataclasses import dataclass

from core.types import AttributeValueType, DeviceConfig, TransportProtocols

from .device_schema import DeviceSchema
from .transports import TransportClient, get_transport_client


@dataclass
class Driver:
    name: str
    env: dict
    transport: TransportClient
    schema: DeviceSchema

    async def read_value(
        self,
        attribute_name: str,
        device_config: DeviceConfig,
    ) -> AttributeValueType:
        attibute_schema = self.schema.get_attribute_schema(
            attribute_name=attribute_name,
        )
        return await self.transport.read(
            address=attibute_schema.address,
            context={**device_config, **self.env},
            value_parser=attibute_schema.value_parser,
        )

    @classmethod
    def from_dict(cls, data: dict) -> "Driver":
        transport = data.get("transport")
        if transport is None or transport not in TransportProtocols:
            msg = f"Invalid or missing transport protocol: '{transport}'"
            raise ValueError(msg)
        transport_client = get_transport_client(
            data["transport"],
            data["transport_config"],
        )
        device_schema = DeviceSchema.from_dict(data)
        driver_env = data.get("env", {})
        return cls(
            name=data.get("name", ""),
            env=driver_env,
            transport=transport_client,
            schema=device_schema,
        )
