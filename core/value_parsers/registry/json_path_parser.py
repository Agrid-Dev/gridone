from typing import cast

import jsonpath

from core.types import AttributeValueType
from core.value_parsers.value_parser import ValueParser


def json_path_parser(data: dict, json_path: str) -> AttributeValueType:
    match = jsonpath.match(json_path, data)
    if match:
        return cast("AttributeValueType", match.value)
    msg = f"Could not find value for json path {json_path}"
    raise ValueError(msg)


class JsonPathParser(ValueParser[dict]):
    json_path: str

    def __init__(self, raw: str) -> None:
        self.json_path = raw

    def parse(self, value: dict) -> AttributeValueType:
        return json_path_parser(value, self.json_path)
