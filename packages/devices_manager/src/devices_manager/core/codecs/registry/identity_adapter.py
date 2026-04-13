from typing import Any

from devices_manager.core.codecs.fn_codec import FnCodec


def _identity(x: Any) -> Any:  # noqa: ANN401
    return x


def identity_adapter(raw: str) -> FnCodec:  # noqa: ARG001
    return FnCodec(encoder=_identity, decoder=_identity)
