from typing import Any

from devices_manager.core.codecs.fn_codec import FnCodec, identity
from models.errors import InvalidError


def options_adapter(options: list[str | int]) -> FnCodec:
    def encode(value: Any) -> Any:  # noqa: ANN401
        if value not in options:
            msg = f"Value {value!r} is not in options: {options}"
            raise InvalidError(msg)
        return value

    return FnCodec(decoder=identity, encoder=encode)
