from devices_manager.core.codecs.fn_codec import FnCodec, identity
from models.errors import InvalidError


def options_adapter[T](options: list[T]) -> FnCodec[T, T]:
    allowed = frozenset(options)

    def encode(value: T) -> T:
        if value not in allowed:
            msg = f"Value {value!r} is not in options: {options}"
            raise InvalidError(msg)
        return value

    return FnCodec(decoder=identity, encoder=encode)
