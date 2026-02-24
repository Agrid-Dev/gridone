import json

from jsonpath import pointer

from devices_manager.core.value_adapters.fn_adapter import FnAdapter
from devices_manager.types import AttributeValueType


def json_pointer_adapter(
    json_pointer_str: str,
) -> FnAdapter[dict | str, AttributeValueType]:
    """
    Retrieve a value from a dict (or a JSON string) using a JSON pointer.
    (RFC 6901 standard)
    Ex: data= {"a": 1, "b": {"c": 2}}, json_pointer="/b/c" -> returns 2
    """

    def decode(d: dict | str) -> AttributeValueType:
        if isinstance(d, str):
            d = json.loads(d)
        return pointer.resolve(json_pointer_str, d)

    return FnAdapter(decoder=decode)
