import base64
import json

from jsonpath import pointer

from devices_manager.core.value_adapters.fn_adapter import FnAdapter
from devices_manager.types import AttributeValueType


def _build_dict_at_pointer(json_pointer_str: str, value: object) -> object:
    if not json_pointer_str or json_pointer_str == "/":
        return value
    parts = json_pointer_str.lstrip("/").split("/")
    result: dict = {}
    current = result
    for part in parts[:-1]:
        current[part] = {}
        current = current[part]
    current[parts[-1]] = value
    return result


def base64_adapter(json_pointer_str: str) -> FnAdapter[str, AttributeValueType]:
    """Generic base64 + JSON value adapter."""

    def decode(value: str) -> AttributeValueType:
        raw = base64.b64decode(value)
        data = json.loads(raw)
        return pointer.resolve(json_pointer_str, data)

    def encode(value: AttributeValueType) -> str:
        data = _build_dict_at_pointer(json_pointer_str, value)
        raw = json.dumps(data).encode()
        return base64.b64encode(raw).decode()

    return FnAdapter(decoder=decode, encoder=encode)
