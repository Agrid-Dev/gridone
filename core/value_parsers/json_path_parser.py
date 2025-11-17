from typing import cast

import jsonpath

from core.types import AttributeValueType


def json_path_parser(data: dict, json_path: str) -> AttributeValueType:
    match = jsonpath.match(json_path, data)
    if match:
        return cast("AttributeValueType", match.value)
    msg = f"Could not find value for json path {json_path}"
    raise ValueError(msg)
