from typing import Annotated

from pydantic import BaseModel, BeforeValidator

from .fn_adapter import FnAdapter
from .registry.base64_adapter import base64_adapter
from .registry.bool_format_adapter import bool_format_adapter
from .registry.byte_convert_adapter import byte_convert_adapter
from .registry.identity_adapter import identity_adapter
from .registry.json_path_adapter import json_path_adapter
from .registry.json_pointer_adapter import json_pointer_adapter
from .registry.scale_adapter import scale_adapter
from .registry.tlv_adapter import tlv_adapter

value_adapter_builders = {
    "identity": identity_adapter,
    "scale": scale_adapter,
    "json_pointer": json_pointer_adapter,
    "json_path": json_path_adapter,
    "bool_format": bool_format_adapter,
    "byte_convert": byte_convert_adapter,
    "base64": base64_adapter,
    "tlv": tlv_adapter,
}

supported_value_adapters = list(value_adapter_builders.keys())
RawArg = str | float | dict


def is_supported(adapter: str) -> str:
    if adapter in supported_value_adapters:
        return adapter
    supported = ", ".join(supported_value_adapters)
    msg = f"Adapter '{adapter} not supported. Supported adapters: {supported}"
    raise ValueError(msg)


class ValueAdapterSpec(BaseModel):
    adapter: Annotated[str, BeforeValidator(is_supported)]
    argument: RawArg


def spec_from_raw(raw: dict[str, str]) -> ValueAdapterSpec:
    if len(raw) != 1:
        msg = "One adapter spec exactly needs to be defined"
        raise ValueError(msg)
    adpater, argument = next(iter(raw.items()))
    return ValueAdapterSpec(adapter=adpater, argument=argument)


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
