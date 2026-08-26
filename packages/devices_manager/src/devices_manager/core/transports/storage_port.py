from __future__ import annotations

from typing import TYPE_CHECKING, Protocol

if TYPE_CHECKING:
    from .base import TransportClient


class TransportStorage(Protocol):
    """Domain-typed persistence port for transports.

    Defined in core and implemented by storage backends (dependency
    inversion): backends hand back fully-built clients and keep their
    durable representation private. Connection state is runtime status —
    it is never persisted, so hydrated clients always start idle.
    """

    async def read(self, item_id: str) -> TransportClient: ...

    async def write(self, item_id: str, client: TransportClient) -> None: ...

    async def read_all(self) -> list[TransportClient]: ...

    async def list_all(self) -> list[str]: ...

    async def delete(self, item_id: str) -> None: ...
