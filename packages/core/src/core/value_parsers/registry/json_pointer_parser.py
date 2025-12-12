from jsonpath import JSONPointerError, pointer

from core.types import AttributeValueType
from core.value_parsers.value_parser import ValueParser


def is_valid_json_pointer(json_pointer: str) -> tuple[bool, str | None]:
    try:
        pointer.resolve(json_pointer, {})
    except JSONPointerError as e:
        if "pointer key error" not in str(
            e,
        ):  # valid pointer but key error as empty data
            return False, f"Invalid JSON pointer: {e}"
    return True, ""


class JsonPointerParser(ValueParser[dict, AttributeValueType]):
    json_pointer: str

    def __init__(self, raw: str) -> None:
        is_valid_json_pointer(raw)
        self.json_pointer = raw

    def parse(self, value: dict) -> AttributeValueType:
        """
        Retrieve a value from a dict context using a JSON pointer.
        (RFC 6901 standard)
        Ex: data= {"a": 1, "b": {"c": 2}}, json_pointer="/b/c" -> returns 2
        """
        return pointer.resolve(self.json_pointer, value)  # ty: ignore[invalid-return-type]
