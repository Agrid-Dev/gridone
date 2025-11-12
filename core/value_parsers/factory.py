from .json_pointer_parser import is_valid_json_pointer, json_pointer_parser
from .scale_parser import scale_parser
from .value_parser import ValueParser


def value_parser_factory(
    *,
    json_pointer: str | None = None,
    scale: str | float | None = None,
) -> ValueParser:
    if json_pointer is not None:
        is_valid, error_message = is_valid_json_pointer(json_pointer)
        if not is_valid:
            msg = f"Invalid JSON pointer: {json_pointer} ({error_message})"
            raise ValueError(msg)
        return lambda result: json_pointer_parser(result, json_pointer)  # pyright: ignore[reportArgumentType]
    if scale is not None:
        return lambda result: scale_parser(result, float(scale))
    msg = "At least one parser parameter must be provided"
    raise ValueError(msg)
