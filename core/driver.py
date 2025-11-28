from dataclasses import dataclass
from typing import TYPE_CHECKING

from core.types import AttributeValueType, DeviceConfig, TransportProtocols
from core.value_parsers import build_value_parser

from .device_schema import DeviceSchema
from .transports import TransportClient, get_transport_client

if TYPE_CHECKING:
    from .device_schema.attribute_schema import AttributeSchema


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
        context = {**device_config, **self.env}
        attribute_schema = self.schema.get_attribute_schema(
            attribute_name=attribute_name,
        ).render(context)
        value_parser = build_value_parser(
            attribute_schema.value_parser.parser_key,
            attribute_schema.value_parser.parser_raw,
        )

        return await self.transport.read(
            address=attribute_schema.read,
            value_parser=value_parser,
            context=context,
        )

    async def write_value(
        self,
        attribute_name: str,
        device_config: DeviceConfig,
        value: AttributeValueType,
    ) -> None:
        context = {**device_config, **self.env, "value": value}
        attribute_schema: AttributeSchema = self.schema.get_attribute_schema(
            attribute_name=attribute_name,
        ).render(context)
        if attribute_schema.write is None:
            msg = f"Attribute '{attribute_name}' is not writable"
            raise ValueError(msg)
        value_parser = build_value_parser(
            attribute_schema.value_parser.parser_key,
            attribute_schema.value_parser.parser_raw,
        )
        await self.transport.write(
            address=attribute_schema.write,
            value=value,
            context=context,
            value_parser=value_parser,
        )

    @classmethod
    def from_dict(cls, data: dict) -> "Driver":
        transport = data.get("transport")
        if transport is None or transport not in TransportProtocols:
            msg = f"Invalid or missing transport protocol: '{transport}'"
            raise ValueError(msg)
        transport_protocol = TransportProtocols(transport)
        driver_env_raw = data.get("env", {})
        driver_env = driver_env_raw if isinstance(driver_env_raw, dict) else {}
        transport_client = get_transport_client(
            transport_protocol,
            data["transport_config"],
        )
        device_schema = DeviceSchema.from_dict(data)
        return cls(
            name=data.get("name", ""),
            env=driver_env,
            transport=transport_client,
            schema=device_schema,
        )
