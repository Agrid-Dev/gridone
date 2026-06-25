from dataclasses import dataclass
from typing import Annotated, Any

from pydantic import BaseModel, BeforeValidator

from models.errors import InvalidError

from .fn_codec import FnCodec
from .registry.base64_codec import base64_codec
from .registry.bit_codec import bit_codec
from .registry.bool_format_codec import bool_format_codec
from .registry.byte_convert_codec import byte_convert_codec
from .registry.byte_frame_codec import byte_frame_codec
from .registry.identity_codec import identity_codec
from .registry.json_path_codec import json_path_codec
from .registry.json_pointer_codec import json_pointer_codec
from .registry.knx_dpt_codec import knx_dpt_codec
from .registry.mapping_codec import mapping_codec
from .registry.offset_codec import offset_codec
from .registry.options_codec import options_codec
from .registry.scale_codec import scale_codec
from .registry.slice_codec import slice_codec

RawArgTypes = (str, int, float, dict, list)
RawArg = str | int | float | dict[Any, Any] | list[Any]


@dataclass(frozen=True, slots=True)
class CodecEntry:
    builder: Any  # Callable[[arg_type], FnCodec]
    arg_type: type | tuple[type, ...]


codec_entries: dict[str, CodecEntry] = {
    "identity": CodecEntry(builder=identity_codec, arg_type=RawArgTypes),
    "scale": CodecEntry(builder=scale_codec, arg_type=(int, float)),
    "offset": CodecEntry(builder=offset_codec, arg_type=(int, float)),
    "json_pointer": CodecEntry(builder=json_pointer_codec, arg_type=str),
    "json_path": CodecEntry(builder=json_path_codec, arg_type=str),
    "bool_format": CodecEntry(builder=bool_format_codec, arg_type=str),
    "bit": CodecEntry(builder=bit_codec, arg_type=int),
    "byte_convert": CodecEntry(builder=byte_convert_codec, arg_type=str),
    "base64": CodecEntry(builder=base64_codec, arg_type=str),
    "byte_frame": CodecEntry(builder=byte_frame_codec, arg_type=str),
    "slice": CodecEntry(builder=slice_codec, arg_type=str),
    "mapping": CodecEntry(builder=mapping_codec, arg_type=dict),
    "options": CodecEntry(builder=options_codec, arg_type=list),
    "knx_dpt": CodecEntry(builder=knx_dpt_codec, arg_type=str),
}

supported_codecs = list(codec_entries.keys())


def is_supported_codec(name: str) -> str:
    if name in supported_codecs:
        return name
    supported = ", ".join(supported_codecs)
    msg = f"Codec '{name}' is not supported. Supported codecs: {supported}"
    raise InvalidError(msg)


class CodecSpec(BaseModel):
    name: Annotated[str, BeforeValidator(is_supported_codec)]
    argument: RawArg


def codec_spec_from_raw(raw: dict[str, Any]) -> CodecSpec:
    if len(raw) != 1:
        msg = "Exactly one codec entry must be defined per list item"
        raise InvalidError(msg)
    codec_name, argument = next(iter(raw.items()))
    return CodecSpec(name=codec_name, argument=argument)


def _build_one_codec(spec: CodecSpec) -> FnCodec:
    entry = codec_entries.get(spec.name)
    if not entry:
        msg = f"Unknown codec: {spec.name}"
        raise InvalidError(msg)
    if not isinstance(spec.argument, entry.arg_type):
        expected = (
            entry.arg_type.__name__
            if isinstance(entry.arg_type, type)
            else " | ".join(t.__name__ for t in entry.arg_type)
        )
        msg = (
            f"Codec '{spec.name}' expects argument of type {expected}, "
            f"got {type(spec.argument).__name__}"
        )
        raise InvalidError(msg)
    return entry.builder(spec.argument)


def build_codec(specs: list[CodecSpec]) -> FnCodec:
    if not specs:
        return identity_codec("")
    built = [_build_one_codec(spec) for spec in specs]
    pipeline = built[0]
    for c in built[1:]:
        pipeline += c
    return pipeline
