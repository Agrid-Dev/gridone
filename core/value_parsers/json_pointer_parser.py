from jsonpath import JSONPointerError, pointer

from core.types import AttributeValueType


def is_valid_json_pointer(json_pointer: str) -> tuple[bool, str | None]:
    try:
        pointer.resolve(json_pointer, {})
    except JSONPointerError as e:
        if "pointer key error" not in str(
            e,
        ):  # valid pointer but key error as empty data
            return False, f"Invalid JSON pointer: {e}"
    return True, ""


def json_pointer_parser(data: dict, json_pointer: str) -> AttributeValueType:
    """
    Retrieve a value from a dict context using a JSON pointer.
    (RFC 6901 standard)
    Ex: data= {"a": 1, "b": {"c": 2}}, json_pointer="/b/c" -> returns 2
    """
    return pointer.resolve(json_pointer, data)  # ty: ignore[invalid-return-type]
