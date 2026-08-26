from __future__ import annotations

from typing import TYPE_CHECKING, Protocol

if TYPE_CHECKING:
    from .driver import Driver


class DriverStorage(Protocol):
    """Domain-typed persistence port for drivers.

    Defined in core and implemented by storage backends (dependency
    inversion): backends hand back fully-built drivers and keep their
    durable representation private.
    """

    async def read(self, item_id: str) -> Driver: ...

    async def write(self, item_id: str, driver: Driver) -> None: ...

    async def read_all(self) -> list[Driver]: ...

    async def list_all(self) -> list[str]: ...

    async def delete(self, item_id: str) -> None: ...
