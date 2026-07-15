from asyncio import Task, as_completed, create_task, gather
from collections.abc import AsyncGenerator

from .base import T_TransportAddress, TransportClient, dedupe_addresses
from .read_result import ReadResult


class ConcurrentReadMixin(TransportClient[T_TransportAddress]):
    """``read_many`` strategy for transports that can fetch concurrently
    (HTTP, MQTT): one task per distinct address, yielded as each completes.
    """

    async def read_many(
        self,
        addresses: list[T_TransportAddress],
        correlation_id: str | None = None,
    ) -> AsyncGenerator[ReadResult]:
        tasks: list[Task[ReadResult]] = [
            create_task(self._read_one(address, correlation_id))
            for address in dedupe_addresses(addresses).values()
        ]
        try:
            for coro in as_completed(tasks):
                yield await coro
        finally:
            pending = [task for task in tasks if not task.done()]
            for task in pending:
                task.cancel()
            if pending:
                await gather(*pending, return_exceptions=True)
