from __future__ import annotations

from dataclasses import dataclass, field
from typing import TYPE_CHECKING

from commands.models import Command, SortOrder

if TYPE_CHECKING:
    from datetime import datetime

    from commands.filters import CommandsQueryFilters
    from commands.models import CommandCreate, CommandStatus


@dataclass
class MemoryStorage:
    _history: list[Command] = field(default_factory=list)
    _current_index: int = 0

    async def save_command(self, command: CommandCreate) -> Command:
        self._current_index += 1
        new_command = Command(id=self._current_index, **command.__dict__)
        self._history.append(new_command)
        return new_command

    async def save_commands(self, commands: list[CommandCreate]) -> list[Command]:
        return [await self.save_command(cmd) for cmd in commands]

    async def update_command_status(
        self,
        command_id: int,
        status: CommandStatus,
        *,
        status_details: str | None = None,
        completed_at: datetime | None = None,
    ) -> Command:
        for cmd in self._history:
            if cmd.id == command_id:
                cmd.status = status
                if status_details is not None:
                    cmd.status_details = status_details
                if completed_at is not None:
                    cmd.completed_at = completed_at
                return cmd
        msg = f"Command {command_id} not found"
        raise ValueError(msg)

    def _apply_filters(self, filters: CommandsQueryFilters) -> list[Command]:
        results = list(self._history)
        if filters.group_id is not None:
            results = [c for c in results if c.group_id == filters.group_id]
        if filters.device_id is not None:
            results = [c for c in results if c.device_id == filters.device_id]
        if filters.attribute is not None:
            results = [c for c in results if c.attribute == filters.attribute]
        if filters.user_id is not None:
            results = [c for c in results if c.user_id == filters.user_id]
        if filters.start is not None:
            results = [c for c in results if c.created_at >= filters.start]
        if filters.end is not None:
            results = [c for c in results if c.created_at < filters.end]
        return results

    async def get_commands(
        self,
        filters: CommandsQueryFilters,
        *,
        sort: SortOrder = SortOrder.ASC,
        limit: int | None = None,
        offset: int | None = None,
    ) -> list[Command]:
        results = self._apply_filters(filters)
        if sort == SortOrder.DESC:
            results = list(reversed(results))
        if offset is not None:
            results = results[offset:]
        if limit is not None:
            results = results[:limit]
        return results

    async def get_commands_by_ids(self, ids: list[int]) -> list[Command]:
        id_set = set(ids)
        return [c for c in self._history if c.id in id_set]

    async def count_commands(self, filters: CommandsQueryFilters) -> int:
        return len(self._apply_filters(filters))

    async def close(self) -> None:
        pass
