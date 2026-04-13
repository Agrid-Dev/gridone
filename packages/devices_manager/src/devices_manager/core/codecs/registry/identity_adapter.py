from typing import Any

from devices_manager.core.value_adapters.fn_adapter import FnAdapter


def _identity(x: Any) -> Any:  # noqa: ANN401
    return x


def identity_adapter(raw: str) -> FnAdapter:  # noqa: ARG001
    return FnAdapter(encoder=_identity, decoder=_identity)
