from asyncio import as_completed, create_task, gather
from collections.abc import AsyncGenerator, Awaitable, Callable, Iterable
from dataclasses import dataclass

from devices_manager.types import AttributeValueType

from .transport_address import TransportAddress


@dataclass(frozen=True, slots=True)
class ReadOk:
    address_id: str
    value: AttributeValueType


@dataclass(frozen=True, slots=True)
class ReadError:
    address_id: str
    error: Exception


type ReadResult = ReadOk | ReadError


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
