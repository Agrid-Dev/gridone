from __future__ import annotations

from typing import TYPE_CHECKING, Protocol

if TYPE_CHECKING:
    from .devices_discovery_manager import DiscoveryConfig


class DiscoveryStorage(Protocol):
    """Persistence port for discovery registrations, so they survive a restart."""

    async def read_all(self) -> list[DiscoveryConfig]: ...

    async def write(self, config: DiscoveryConfig) -> None: ...

    async def delete(self, config: DiscoveryConfig) -> None: ...
