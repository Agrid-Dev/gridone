from pydantic import BaseModel

from .fn_adapter import FnAdapter
from .registry.bool_format_adapter import bool_format_adapter
from .registry.identity_adapter import identity_adapter
from .registry.json_path_adapter import json_path_adapter
from .registry.json_pointer_adapter import json_pointer_adapter
from .registry.scale_adapter import scale_adapter

value_adapter_builders = {
    "identity": identity_adapter,
    "scale": scale_adapter,
    "json_pointer": json_pointer_adapter,
    "json_path": json_path_adapter,
    "bool_format": bool_format_adapter,
}

supported_value_adapters = list(value_adapter_builders.keys())
RawArg = str | float


class ValueAdapterSpec(BaseModel):
    adapter: str
    argument: RawArg


def _build_one_value_adapter(raw_adapter: ValueAdapterSpec) -> FnAdapter:
    builder = value_adapter_builders.get(raw_adapter.adapter)
    if not builder:
        msg = f"Unknown value adapter: {raw_adapter.adapter}"
        raise ValueError(msg)
    return builder(raw_adapter.argument)


def build_value_adapter(raw_adapters: list[ValueAdapterSpec]) -> FnAdapter:
    if not raw_adapters:
        return identity_adapter("")
    built = [_build_one_value_adapter(adapter) for adapter in raw_adapters]
    pipeline = built[0]
    for adapter in built[1:]:
        pipeline += adapter
    return pipeline
