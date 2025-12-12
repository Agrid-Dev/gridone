from core.utils.cast.bool import cast_as_bool
from core.value_adapters.fn_adapter import FnAdapter

SUPPORTED_FORMAT = "0/1"


def bool_format_adapter(raw: str) -> FnAdapter[int, bool]:
    if raw != SUPPORTED_FORMAT:
        msg = f"Unsupported bool format: {raw}"
        raise ValueError(msg)

    return FnAdapter(decoder=cast_as_bool, encoder=int)
