from __future__ import annotations

from typing import TYPE_CHECKING, Protocol

from models.types import SortOrder

if TYPE_CHECKING:
    from datetime import datetime

    from commands.filters import CommandsQueryFilters
    from commands.models import CommandStatus, UnitCommand, UnitCommandCreate


class CommandsStorage(Protocol):
    async def save_command(self, command: UnitCommandCreate) -> UnitCommand: ...

    async def save_commands(
        self, commands: list[UnitCommandCreate]
    ) -> list[UnitCommand]: ...

    async def update_command_status(
        self,
        command_id: int,
        status: CommandStatus,
        *,
        status_details: str | None = None,
        completed_at: datetime | None = None,
    ) -> UnitCommand: ...

    async def get_commands(
        self,
        filters: CommandsQueryFilters,
        *,
        sort: SortOrder = SortOrder.ASC,
        limit: int | None = None,
        offset: int | None = None,
    ) -> list[UnitCommand]: ...

    async def get_commands_by_ids(self, ids: list[int]) -> list[UnitCommand]: ...

    async def count_commands(self, filters: CommandsQueryFilters) -> int: ...

    async def close(self) -> None: ...
