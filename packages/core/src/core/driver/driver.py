from collections.abc import Callable
from dataclasses import dataclass
from typing import TYPE_CHECKING

from core.transports import TransportClient
from core.types import AttributeValueType, DeviceConfig
from core.value_parsers import ReversibleValueParser, build_value_parser

from .driver_schema import DriverSchema

if TYPE_CHECKING:
    from .driver_schema.attribute_schema import AttributeSchema


@dataclass
class Driver:
    name: str
    env: dict
    transport: TransportClient
    schema: DriverSchema

    def attach_updater(
        self,
        attribute_name: str,
        device_config: DeviceConfig,
        callback: Callable[[AttributeValueType], None],
    ) -> None:
        context = {**device_config, **self.env}
        try:
            attribute_schema = next(
                a for a in self.schema.attribute_schemas if a.name == attribute_name
            ).render(context)
        except StopIteration as e:
            msg = f"Attribute {attribute_name} is not supported"
            raise ValueError(msg) from e
        address = self.transport.build_address(attribute_schema.read, context)
        value_parser = build_value_parser(
            attribute_schema.value_parser.parser_key,
            attribute_schema.value_parser.parser_raw,
        )

        self.transport.register_read_handler(
            address, lambda v: callback(value_parser.parse(v))
        )

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
        address = self.transport.build_address(attribute_schema.read, context)
        raw_value = await self.transport.read(address)
        return value_parser.parse(raw_value)

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
        address = self.transport.build_address(attribute_schema.write, context)
        value_to_write = (
            value_parser.revert(value)
            if isinstance(value_parser, ReversibleValueParser)
            else value
        )
        await self.transport.write(
            address=address,
            value=value_to_write,  # ty: ignore[invalid-argument-type]
        )

    @classmethod
    def from_dict(cls, data: dict, transport_client: TransportClient) -> "Driver":
        transport = data.get("transport")
        if transport is None or transport != transport_client.protocol:
            msg = (
                f"Expected a {transport} transport but got {transport_client.protocol}"
            )
            raise ValueError(msg)
        driver_env_raw = data.get("env", {})
        driver_env = driver_env_raw if isinstance(driver_env_raw, dict) else {}

        return cls(
            name=data.get("name", ""),
            env=driver_env,
            transport=transport_client,
            schema=DriverSchema.from_dict(data),
        )
