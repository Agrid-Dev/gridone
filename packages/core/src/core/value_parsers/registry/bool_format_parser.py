from core.utils.cast.bool import cast_as_bool
from core.value_parsers.value_parser import ReversibleValueParser

SUPPORTED_FORMAT = "0/1"  # That's the only one for now, no other use case encountered


class BoolFormatParser(ReversibleValueParser[int, bool]):
    format: str

    def __init__(self, raw: str) -> None:
        if raw != SUPPORTED_FORMAT:
            msg = f"Unsupported bool format: {raw}"
            raise ValueError(msg)
        self.format = raw

    def parse(self, value: int) -> bool:
        return cast_as_bool(value)

    def revert(self, value: bool) -> int:  # noqa: FBT001
        return int(value)
