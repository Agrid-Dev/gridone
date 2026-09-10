from typing import cast

import jsonpath
from jsonpath import CompoundJSONPath, JSONPath
from jsonpath.exceptions import JSONPathError

from devices_manager.core.codecs.fn_codec import FnCodec
from devices_manager.types import AttributeValueType
from models.errors import InvalidError


def _compile(path: str) -> JSONPath | CompoundJSONPath:
    """Parse the expression once; a bad one is a driver error, not a decode error."""
    try:
        return jsonpath.compile(path)
    except JSONPathError as e:
        msg = f"Invalid json_path {path!r}: {e}"
        raise InvalidError(msg) from e


def _first_match(
    compiled: JSONPath | CompoundJSONPath, path: str, data: dict | str
) -> AttributeValueType:
    """``path`` is the expression as written in the driver: the compiled
    object renders in a normalised form the author would not recognise."""
    match = compiled.match(data)
    if match:
        return cast("AttributeValueType", match.value)
    msg = f"Could not find value for json path {path}"
    raise ValueError(msg)


def json_path_parser(data: dict | str, json_path: str) -> AttributeValueType:
    return _first_match(_compile(json_path), json_path, data)


def json_path_codec(path: str) -> FnCodec[dict | str, AttributeValueType]:
    # Compiled here, not per decode: a push device decodes every frame of its
    # topic through every attribute's codec.
    compiled = _compile(path)
    return FnCodec(decoder=lambda d: _first_match(compiled, path, d))
