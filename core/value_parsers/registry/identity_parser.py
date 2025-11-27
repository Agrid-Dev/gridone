from core.types import AttributeValueType
from core.value_parsers.value_parser import ReversibleValueParser


class IdentityParser(ReversibleValueParser[AttributeValueType]):
    """Default value parser (no parsing, returns value as is)."""

    def __init__(self, raw: str) -> None:
        pass

    def parse(self, value: AttributeValueType) -> AttributeValueType:
        return value

    def revert(self, value: AttributeValueType) -> AttributeValueType:
        return value
