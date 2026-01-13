from core.transports import RawTransportAddress
from core.types import DataType
from core.value_adapters import FnAdapter, ValueAdapterSpec, build_value_adapter
from core.value_adapters.factory import supported_value_adapters


class AttributeDriver:
    name: str
    data_type: DataType
    read: RawTransportAddress
    write: RawTransportAddress | None = None
    value_adapter_specs: list[ValueAdapterSpec]
    value_adapter: FnAdapter

    def __init__(
        self,
        name: str,
        data_type: DataType,
        read: RawTransportAddress,
        write: RawTransportAddress | None,
        value_adapter_specs: list[ValueAdapterSpec],
    ) -> None:
        self.name = name
        self.data_type = data_type
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
            read=read,
            write=write,
            value_adapter_specs=adapter_specs,
        )
