from __future__ import annotations

from typing import TYPE_CHECKING, Protocol

from commands.models import SortOrder

if TYPE_CHECKING:
    from datetime import datetime

    from commands.filters import CommandsQueryFilters
    from commands.models import Command, CommandCreate, CommandStatus


class CommandsStorage(Protocol):
    async def save_command(self, command: CommandCreate) -> Command: ...

    async def save_commands(self, commands: list[CommandCreate]) -> list[Command]: ...

    async def update_command_status(
        self,
        command_id: int,
        status: CommandStatus,
        *,
        status_details: str | None = None,
        completed_at: datetime | None = None,
    ) -> Command: ...

    async def get_commands(
        self,
        filters: CommandsQueryFilters,
        *,
        sort: SortOrder = SortOrder.ASC,
        limit: int | None = None,
        offset: int | None = None,
    ) -> list[Command]: ...

    async def get_commands_by_ids(self, ids: list[int]) -> list[Command]: ...

    async def count_commands(self, filters: CommandsQueryFilters) -> int: ...

    async def close(self) -> None: ...
