from typing import cast

import jsonpath

from devices_manager.core.codecs.fn_codec import FnCodec
from devices_manager.types import AttributeValueType


def json_path_parser(data: dict, json_path: str) -> AttributeValueType:
    match = jsonpath.match(json_path, data)
    if match:
        return cast("AttributeValueType", match.value)
    msg = f"Could not find value for json path {json_path}"
    raise ValueError(msg)


def json_path_adapter(path: str) -> FnCodec[dict, AttributeValueType]:
    return FnCodec(decoder=lambda d: json_path_parser(d, path))
