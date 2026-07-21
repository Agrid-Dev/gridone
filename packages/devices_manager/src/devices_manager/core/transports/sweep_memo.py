import logging
from collections.abc import Awaitable, Callable
from dataclasses import dataclass
from functools import wraps
from typing import TYPE_CHECKING, Protocol, cast

from devices_manager.types import AttributeValueType

if TYPE_CHECKING:
    from .transport_address import TransportAddress

logger = logging.getLogger(__name__)


@dataclass
class MemoStats:
    """Windowed counter for memo effectiveness on one transport instance.

    ``network`` counts misses, ``reads`` counts sweep reads, so
    ``network / reads`` never exceeds ``1``: ``1.0`` means the memo caught
    nothing, lower means more reads were coalesced.
    """

    window: int = 100
    reads: int = 0
    network: int = 0

    def record(self, *, hit: bool) -> None:
        """Tally one sweep read; emit the ratio and reset every ``window`` reads.

        Resetting keeps the average rolling, so a regression surfaces in the next
        window instead of being flattened by a cumulative count.
        """
        self.reads += 1
        self.network += 0 if hit else 1
        if self.reads >= self.window:
            logger.info(
                "sweep memo",
                extra={
                    "network_per_read": self.network / self.reads,
                    "reads": self.reads,
                },
            )
            self.reads = self.network = 0


class _SweepMemoized(Protocol):
    _memo_stats: MemoStats

    def _recall_read(
        self, address: "TransportAddress", correlation_id: str | None
    ) -> AttributeValueType | None: ...

    def _remember_read(
        self,
        address: "TransportAddress",
        correlation_id: str | None,
        value: AttributeValueType,
    ) -> None: ...


def memoize_sweep[**P](
    read: Callable[P, Awaitable[AttributeValueType]],
) -> Callable[P, Awaitable[AttributeValueType]]:
    """Serve a value already read under this ``correlation_id``, else read and store it.

    Wraps ``read(self, address, correlation_id=None)`` transparently (the
    signature is preserved). Coalesces repeat reads of one address within a
    sweep; ``correlation_id=None`` always reads and never stores. The store is
    keyed per address (bounded by address count), and a new ``correlation_id``
    misses the old entry, so a reconnect needs no invalidation.
    """

    # The wrapper takes *args/**kwargs (not a concrete
    # (self, address, correlation_id) signature) so ``P`` carries read's own
    # signature through unchanged — callers keep seeing read(T_TransportAddress),
    # not a flattened TransportAddress. The cost is reparsing the arguments below.
    @wraps(read)
    async def wrapper(*args: P.args, **kwargs: P.kwargs) -> AttributeValueType:
        # read is bound as read(self, address, correlation_id=None); either
        # argument may arrive positionally or by keyword, so fall back to kwargs.
        positional = args[1:]
        correlation_id = cast(
            "str | None",
            positional[1] if positional[1:] else kwargs.get("correlation_id"),
        )
        if correlation_id is None:
            return await read(*args, **kwargs)
        memo = cast("_SweepMemoized", args[0])
        address = cast(
            "TransportAddress",
            positional[0] if positional else kwargs["address"],
        )
        cached = memo._recall_read(address, correlation_id)  # noqa: SLF001
        if cached is not None:
            memo._memo_stats.record(hit=True)  # noqa: SLF001
            return cached
        # Record the miss only once the read returns, so a raised read does not
        # count a network call that never completed.
        value = await read(*args, **kwargs)
        memo._memo_stats.record(hit=False)  # noqa: SLF001
        memo._remember_read(address, correlation_id, value)  # noqa: SLF001
        return value

    return wrapper
