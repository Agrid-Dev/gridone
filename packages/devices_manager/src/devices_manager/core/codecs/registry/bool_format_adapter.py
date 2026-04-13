from devices_manager.core.codecs.fn_codec import FnCodec
from devices_manager.core.utils.cast.bool import cast_as_bool

SUPPORTED_FORMAT = "0/1"


def bool_format_adapter(raw: str) -> FnCodec[int, bool]:
    if raw != SUPPORTED_FORMAT:
        msg = f"Unsupported bool format: {raw}"
        raise ValueError(msg)

    return FnCodec(decoder=cast_as_bool, encoder=int)  # ty: ignore[invalid-return-type]
