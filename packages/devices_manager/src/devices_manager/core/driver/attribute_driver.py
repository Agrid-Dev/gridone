from devices_manager.core.transports import RawTransportAddress
from devices_manager.core.value_adapters import (
    FnAdapter,
    ValueAdapterSpec,
    build_value_adapter,
)
from devices_manager.core.value_adapters.factory import supported_value_adapters
from devices_manager.types import DataType


class AttributeDriver:
    name: str
    data_type: DataType
    listen: RawTransportAddress | None = None
    read_request: RawTransportAddress | None = None
    read: RawTransportAddress | None = None
    write: RawTransportAddress | None = None
    value_adapter_specs: list[ValueAdapterSpec]
    value_adapter: FnAdapter

    def __init__(  # noqa: PLR0913
        self,
        name: str,
        data_type: DataType,
        value_adapter_specs: list[ValueAdapterSpec],
        listen: RawTransportAddress | None = None,
        read_request: RawTransportAddress | None = None,
        read: RawTransportAddress | None = None,
        write: RawTransportAddress | None = None,
    ) -> None:
        self.name = name
        self.data_type = data_type
        self.listen = listen
        self.read_request = read_request
        self.read = read
        self.write = write
        self.value_adapter_specs = value_adapter_specs
        self.value_adapter = build_value_adapter(value_adapter_specs)

    @classmethod
    def from_dict(cls, data: dict) -> "AttributeDriver":
        """@deprecated
        (instanciation from exchange/storage models to be moved in dto)"""
        adapter_specs = [
            ValueAdapterSpec(adapter=key, argument=val)
            for key, val in data.items()
            if key in supported_value_adapters
        ]

        read = data.get("read_write", data.get("read"))
        write = data.get("read_write", data.get("write"))

        return cls(
            name=data["name"],
            data_type=DataType(data["data_type"]),
            listen=data.get("listen"),
            read_request=data.get("read_request"),
            read=read,
            write=write,
            value_adapter_specs=adapter_specs,
        )
