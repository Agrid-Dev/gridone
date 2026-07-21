from asyncio import as_completed, create_task, gather
from collections.abc import AsyncGenerator, Awaitable, Callable, Iterable

from devices_manager.types import AttributeValueType

from .read_result import ReadError, ReadOk, ReadResult
from .transport_address import TransportAddress


async def read_results[T: TransportAddress](
    addresses: Iterable[T],
    read: Callable[[T], Awaitable[AttributeValueType]],
    *,
    concurrent: bool,
) -> AsyncGenerator[ReadResult]:
    """Map each address through ``read``, yielding one ``ReadResult`` apiece.

    Sequential when ``concurrent`` is ``False``; otherwise one task per
    address, yielded as each lands. A failing read becomes a ``ReadError``
    rather than aborting the batch. On early generator close the concurrent
    branch cancels and drains outstanding tasks so no read is left in flight.
    """

    async def one(address: T) -> ReadResult:
        try:
            return ReadOk(address.id, await read(address))
        except Exception as e:  # noqa: BLE001
            return ReadError(address.id, e)

    if not concurrent:
        for address in addresses:
            yield await one(address)
        return

    tasks = [create_task(one(address)) for address in addresses]
    try:
        for coro in as_completed(tasks):
            yield await coro
    finally:
        pending = [task for task in tasks if not task.done()]
        for task in pending:
            task.cancel()
        if pending:
            await gather(*pending, return_exceptions=True)
