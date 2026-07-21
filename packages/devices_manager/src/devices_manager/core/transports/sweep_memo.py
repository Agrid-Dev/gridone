import logging
from collections.abc import Awaitable, Callable
from dataclasses import dataclass, field
from functools import wraps
from typing import TYPE_CHECKING

from devices_manager.types import AttributeValueType, TransportProtocols

if TYPE_CHECKING:
    from .base import TransportClient
    from .transport_address import TransportAddress

logger = logging.getLogger(__name__)


@dataclass
class SweepMemo:
    """Per-transport request coalescing for one sweep, plus effectiveness stats.

    Holds at most one entry per ``address.id``: a value read under a given
    ``correlation_id`` is reused by later reads sharing that id (one sweep) and
    silently superseded when a new id arrives, so a reconnect needs no
    invalidation. The store is bounded by the number of distinct addresses, not
    by time. :meth:`record` tracks how often the memo is hit and logs the ratio
    every ``window`` reads, tagged with the owning transport.
    """

    transport_id: str
    protocol: TransportProtocols
    window: int = 100
    _entries: dict[str, tuple[str, AttributeValueType]] = field(default_factory=dict)
    _reads: int = 0
    _network: int = 0

    def recall(self, address_id: str, correlation_id: str) -> AttributeValueType | None:
        """Return the value memoized for this sweep, or ``None`` on a miss.

        ``None`` is an unambiguous miss: ``AttributeValueType`` never includes it.
        """
        entry = self._entries.get(address_id)
        if entry is None or entry[0] != correlation_id:
            return None
        return entry[1]

    def remember(
        self, address_id: str, correlation_id: str, value: AttributeValueType
    ) -> None:
        """Memoize a value for this sweep, keyed per ``address.id``."""
        self._entries[address_id] = (correlation_id, value)

    def record(self, *, hit: bool) -> None:
        """Tally one sweep read; emit the ratio and reset every ``window`` reads.

        ``_network`` counts misses, so ``_network / _reads`` never exceeds ``1``:
        ``1.0`` means the memo caught nothing, lower means more reads coalesced.
        Resetting keeps the average rolling, so a regression surfaces in the next
        window instead of being flattened by a cumulative count.
        """
        self._reads += 1
        self._network += 0 if hit else 1
        if self._reads >= self.window:
            logger.info(
                "sweep memo",
                extra={
                    "transport": self.transport_id,
                    "protocol": self.protocol,
                    "network_per_read": self._network / self._reads,
                    "reads": self._reads,
                },
            )
            self._reads = self._network = 0


def memoize_sweep(
    read: Callable[..., Awaitable[AttributeValueType]],
) -> Callable[..., Awaitable[AttributeValueType]]:
    """Coalesce repeat reads of one address within a sweep.

    Wraps ``read(self, address, correlation_id=None)``: with a ``correlation_id``
    a value already read under that id is served from ``self._sweep_memo``;
    ``correlation_id=None`` (on-demand) always reads and is excluded from both
    the memo and its stats. The miss is recorded only once the read returns, so a
    raised read counts no network call that never completed.
    """

    @wraps(read)
    async def wrapper(
        self: "TransportClient",
        address: "TransportAddress",
        correlation_id: str | None = None,
    ) -> AttributeValueType:
        if correlation_id is None:
            return await read(self, address, None)
        memo = self._sweep_memo
        cached = memo.recall(address.id, correlation_id)
        if cached is not None:
            memo.record(hit=True)
            return cached
        value = await read(self, address, correlation_id)
        memo.record(hit=False)
        memo.remember(address.id, correlation_id, value)
        return value

    return wrapper
