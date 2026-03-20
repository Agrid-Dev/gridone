from dataclasses import dataclass
from typing import Annotated, Any

from pydantic import BaseModel, BeforeValidator

from .fn_adapter import FnAdapter
from .registry.base64_adapter import base64_adapter
from .registry.bool_format_adapter import bool_format_adapter
from .registry.byte_convert_adapter import byte_convert_adapter
from .registry.byte_frame_adapter import byte_frame_adapter
from .registry.identity_adapter import identity_adapter
from .registry.json_path_adapter import json_path_adapter
from .registry.json_pointer_adapter import json_pointer_adapter
from .registry.mapping_adapter import mapping_adapter
from .registry.scale_adapter import scale_adapter
from .registry.slice_adapter import slice_adapter

RawArgTypes = (str, int, float, dict)
RawArg = str | int | float | dict[Any, Any]


@dataclass(frozen=True, slots=True)
class AdapterEntry:
    builder: Any  # Callable[[arg_type], FnAdapter]
    arg_type: type | tuple[type, ...]


value_adapter_entries: dict[str, AdapterEntry] = {
    "identity": AdapterEntry(builder=identity_adapter, arg_type=RawArgTypes),
    "scale": AdapterEntry(builder=scale_adapter, arg_type=(int, float)),
    "json_pointer": AdapterEntry(builder=json_pointer_adapter, arg_type=str),
    "json_path": AdapterEntry(builder=json_path_adapter, arg_type=str),
    "bool_format": AdapterEntry(builder=bool_format_adapter, arg_type=str),
    "byte_convert": AdapterEntry(builder=byte_convert_adapter, arg_type=str),
    "base64": AdapterEntry(builder=base64_adapter, arg_type=str),
    "byte_frame": AdapterEntry(builder=byte_frame_adapter, arg_type=str),
    "slice": AdapterEntry(builder=slice_adapter, arg_type=str),
    "mapping": AdapterEntry(builder=mapping_adapter, arg_type=dict),
}

supported_value_adapters = list(value_adapter_entries.keys())


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
    entry = value_adapter_entries.get(raw_adapter.adapter)
    if not entry:
        msg = f"Unknown value adapter: {raw_adapter.adapter}"
        raise ValueError(msg)
    if not isinstance(raw_adapter.argument, entry.arg_type):
        expected = (
            entry.arg_type.__name__
            if isinstance(entry.arg_type, type)
            else " | ".join(t.__name__ for t in entry.arg_type)
        )
        msg = (
            f"Adapter '{raw_adapter.adapter}' expects argument of type {expected}, "
            f"got {type(raw_adapter.argument).__name__}"
        )
        raise TypeError(msg)
    return entry.builder(raw_adapter.argument)


def build_value_adapter(raw_adapters: list[ValueAdapterSpec]) -> FnAdapter:
    if not raw_adapters:
        return identity_adapter("")
    built = [_build_one_value_adapter(adapter) for adapter in raw_adapters]
    pipeline = built[0]
    for adapter in built[1:]:
        pipeline += adapter
    return pipeline
