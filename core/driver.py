from dataclasses import dataclass

from core.types import AttributeValueType, DeviceConfig, TransportProtocols
from core.utils.proxy import configure_socks_proxy

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
        context = {**device_config, **self.env}
        attribute_schema = self.schema.get_attribute_schema(
            attribute_name=attribute_name,
        ).render(context)
        return await self.transport.read(
            address=attribute_schema.address,
            value_parser=attribute_schema.value_parser,
            context=context,
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
        socks_proxy = configure_socks_proxy(
            driver_env,
            install_asyncio_patch=transport_protocol != TransportProtocols.HTTP,
        )
        transport_client = get_transport_client(
            transport_protocol,
            data["transport_config"],
            socks_proxy=socks_proxy,
        )
        device_schema = DeviceSchema.from_dict(data)
        return cls(
            name=data.get("name", ""),
            env=driver_env,
            transport=transport_client,
            schema=device_schema,
        )
