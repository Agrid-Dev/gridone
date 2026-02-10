from devices_manager.core.value_adapters.fn_adapter import FnAdapter
from devices_manager.types import AttributeValueType
from jsonpath import pointer


def json_pointer_adapter(json_pointer: str) -> FnAdapter[dict, AttributeValueType]:
    """
    Retrieve a value from a dict context using a JSON pointer.
    (RFC 6901 standard)
    Ex: data= {"a": 1, "b": {"c": 2}}, json_pointer="/b/c" -> returns 2
    """
    return FnAdapter(decoder=lambda d: pointer.resolve(json_pointer, d))
