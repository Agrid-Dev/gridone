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
class Codec(Protocol[InT, OutT]):
    def decode(self, value: InT) -> OutT: ...
    def encode(self, value: OutT) -> InT: ...
    def __add__(self, other: Codec[OutT, MidT]) -> Codec[InT, MidT]: ...

    @property
    def value_options(self) -> list[OutT] | None: ...


@dataclass(frozen=True, slots=True)
class FnCodec(Codec[InT, OutT]):
    decoder: Callable[[InT], OutT]
    encoder: Callable[[OutT], InT] = identity
    value_options: list[OutT] | None = None

    def decode(self, value: InT) -> OutT:
        return self.decoder(value)

    def encode(self, value: OutT) -> InT:
        return self.encoder(value)

    def __add__(self, other: Codec[OutT, MidT]) -> FnCodec[InT, MidT]:
        def chained_decode(v: InT) -> MidT:
            return other.decode(self.decode(v))

        def chained_encode(v: MidT) -> InT:
            return self.encode(other.encode(v))

        self_opts = (
            [other.decode(v) for v in self.value_options]
            if self.value_options is not None
            else None
        )
        other_opts = other.value_options

        if self_opts is None:
            chained_options: list[MidT] | None = (
                list(other_opts) if other_opts is not None else None
            )
        elif other_opts is None:
            chained_options = self_opts
        else:
            chained_options = [v for v in self_opts if v in other_opts]

        return FnCodec(
            decoder=chained_decode,
            encoder=chained_encode,
            value_options=chained_options,
        )
