from dataclasses import dataclass
from typing import Annotated, Any

from pydantic import BaseModel, BeforeValidator

from models.errors import InvalidError

from .fn_codec import FnCodec
from .registry.base64_adapter import base64_adapter
from .registry.bool_format_adapter import bool_format_adapter
from .registry.byte_convert_adapter import byte_convert_adapter
from .registry.byte_frame_adapter import byte_frame_adapter
from .registry.identity_adapter import identity_adapter
from .registry.json_path_adapter import json_path_adapter
from .registry.json_pointer_adapter import json_pointer_adapter
from .registry.knx_dpt_adapter import knx_dpt_adapter
from .registry.mapping_adapter import mapping_adapter
from .registry.scale_adapter import scale_adapter
from .registry.slice_adapter import slice_adapter

RawArgTypes = (str, int, float, dict)
RawArg = str | int | float | dict[Any, Any]


@dataclass(frozen=True, slots=True)
class CodecEntry:
    builder: Any  # Callable[[arg_type], FnCodec]
    arg_type: type | tuple[type, ...]


codec_entries: dict[str, CodecEntry] = {
    "identity": CodecEntry(builder=identity_adapter, arg_type=RawArgTypes),
    "scale": CodecEntry(builder=scale_adapter, arg_type=(int, float)),
    "json_pointer": CodecEntry(builder=json_pointer_adapter, arg_type=str),
    "json_path": CodecEntry(builder=json_path_adapter, arg_type=str),
    "bool_format": CodecEntry(builder=bool_format_adapter, arg_type=str),
    "byte_convert": CodecEntry(builder=byte_convert_adapter, arg_type=str),
    "base64": CodecEntry(builder=base64_adapter, arg_type=str),
    "byte_frame": CodecEntry(builder=byte_frame_adapter, arg_type=str),
    "slice": CodecEntry(builder=slice_adapter, arg_type=str),
    "mapping": CodecEntry(builder=mapping_adapter, arg_type=dict),
    "knx_dpt": CodecEntry(builder=knx_dpt_adapter, arg_type=str),
}

supported_codecs = list(codec_entries.keys())


def is_supported_codec(name: str) -> str:
    if name in supported_codecs:
        return name
    supported = ", ".join(supported_codecs)
    msg = f"Codec '{name}' is not supported. Supported codecs: {supported}"
    raise InvalidError(msg)


class CodecSpec(BaseModel):
    adapter: Annotated[str, BeforeValidator(is_supported_codec)]
    argument: RawArg


def codec_spec_from_raw(raw: dict[str, Any]) -> CodecSpec:
    if len(raw) != 1:
        msg = "Exactly one codec entry must be defined per list item"
        raise InvalidError(msg)
    codec_name, argument = next(iter(raw.items()))
    return CodecSpec(adapter=codec_name, argument=argument)


def _build_one_codec(spec: CodecSpec) -> FnCodec:
    entry = codec_entries.get(spec.adapter)
    if not entry:
        msg = f"Unknown codec: {spec.adapter}"
        raise InvalidError(msg)
    if not isinstance(spec.argument, entry.arg_type):
        expected = (
            entry.arg_type.__name__
            if isinstance(entry.arg_type, type)
            else " | ".join(t.__name__ for t in entry.arg_type)
        )
        msg = (
            f"Codec '{spec.adapter}' expects argument of type {expected}, "
            f"got {type(spec.argument).__name__}"
        )
        raise InvalidError(msg)
    return entry.builder(spec.argument)


def build_codec(specs: list[CodecSpec]) -> FnCodec:
    if not specs:
        return identity_adapter("")
    built = [_build_one_codec(spec) for spec in specs]
    pipeline = built[0]
    for c in built[1:]:
        pipeline += c
    return pipeline
