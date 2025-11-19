from core.types import AttributeValueType

from .json_path_parser import json_path_parser
from .json_pointer_parser import is_valid_json_pointer, json_pointer_parser
from .scale_parser import scale_parser
from .value_parser import ValueParser


def identity_function(result: AttributeValueType) -> AttributeValueType:
    return result


def value_parser_factory(
    *,
    json_pointer: str | None = None,
    json_path: str | None = None,
    scale: str | float | None = None,
) -> ValueParser:
    if json_pointer is not None:
        is_valid, error_message = is_valid_json_pointer(json_pointer)
        if not is_valid:
            msg = f"Invalid JSON pointer: {json_pointer} ({error_message})"
            raise ValueError(msg)
        return lambda result: json_pointer_parser(result, json_pointer)  # pyright: ignore[reportArgumentType]
    if json_path is not None:
        return lambda result: json_path_parser(result, json_path)
    if scale is not None:
        return lambda result: scale_parser(result, float(scale))
    return identity_function
