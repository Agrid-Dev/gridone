from typing import TypeVar

from devices_manager.core.value_adapters.fn_adapter import FnAdapter

T = TypeVar("T")


def identity[T](x: T) -> T:
    return x


def identity_adapter(raw: str) -> FnAdapter[T, T]:  # noqa: ARG001
    return FnAdapter(encoder=identity, decoder=identity)
