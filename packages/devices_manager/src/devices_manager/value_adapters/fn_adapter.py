from __future__ import annotations  # optional in 3.13, but OK to keep

from typing import TYPE_CHECKING, Any, Protocol, TypeVar, runtime_checkable

if TYPE_CHECKING:
    from collections.abc import Callable
from dataclasses import dataclass

InT = TypeVar("InT")
OutT = TypeVar("OutT")
MidT = TypeVar("MidT")


def identity(x: Any) -> Any:  # noqa: ANN401
    return x


@runtime_checkable
class Adapter(Protocol[InT, OutT]):
    def decode(self, value: InT) -> OutT: ...
    def encode(self, value: OutT) -> InT: ...

    def __add__(self, other: Adapter[OutT, MidT]) -> Adapter[InT, MidT]: ...


@dataclass(frozen=True, slots=True)
class FnAdapter(Adapter[InT, OutT]):
    decoder: Callable[[InT], OutT]
    encoder: Callable[[OutT], InT] = identity

    def decode(self, value: InT) -> OutT:
        return self.decoder(value)

    def encode(self, value: OutT) -> InT:
        return self.encoder(value)

    def __add__(self, other: Adapter[OutT, MidT]) -> FnAdapter[InT, MidT]:
        def chained_decode(v: InT) -> MidT:
            return other.decode(self.decode(v))

        def chained_encode(v: MidT) -> InT:
            return self.encode(other.encode(v))

        return FnAdapter(decoder=chained_decode, encoder=chained_encode)
