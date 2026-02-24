import base64

from devices_manager.core.value_adapters.fn_adapter import FnAdapter


def base64_adapter(encoding: str) -> FnAdapter[str, str]:
    """
    Decode a base64 string to a plain string (e.g. a JSON string).
    Encode a plain string back to base64.
    """
    enc = encoding or "utf-8"

    def decode(value: str) -> str:
        return base64.b64decode(value).decode(enc)

    def encode(value: str) -> str:
        return base64.b64encode(value.encode(enc)).decode()

    return FnAdapter(decoder=decode, encoder=encode)
