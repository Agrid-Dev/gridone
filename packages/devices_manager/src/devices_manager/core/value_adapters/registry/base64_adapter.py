import base64

from devices_manager.core.value_adapters.fn_adapter import FnAdapter


def base64_adapter(_encoding: str) -> FnAdapter[str, bytes]:
    """
    Decode a base64 string to raw bytes.
    Encode bytes back to a base64 string.
    """

    def decode(value: str) -> bytes:
        return base64.b64decode(value)

    def encode(value: bytes) -> str:
        return base64.b64encode(value).decode()

    return FnAdapter(decoder=decode, encoder=encode)
