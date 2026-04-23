from __future__ import annotations

from dataclasses import dataclass, field
from typing import TYPE_CHECKING

from commands.models import CommandTemplate, UnitCommand
from models.types import SortOrder

if TYPE_CHECKING:
    from datetime import datetime

    from commands.filters import CommandsQueryFilters
    from commands.models import CommandStatus, UnitCommandCreate


@dataclass
class MemoryStorage:
    _history: list[UnitCommand] = field(default_factory=list)
    _templates: dict[str, CommandTemplate] = field(default_factory=dict)
    _current_index: int = 0

    async def save_command(self, command: UnitCommandCreate) -> UnitCommand:
        self._current_index += 1
        new_command = UnitCommand(id=self._current_index, **command.__dict__)
        self._history.append(new_command)
        return new_command

    async def save_commands(
        self, commands: list[UnitCommandCreate]
    ) -> list[UnitCommand]:
        return [await self.save_command(cmd) for cmd in commands]

    async def update_command_status(
        self,
        command_id: int,
        status: CommandStatus,
        *,
        status_details: str | None = None,
        completed_at: datetime | None = None,
    ) -> UnitCommand:
        for cmd in self._history:
            if cmd.id == command_id:
                cmd.status = status
                cmd.status_details = status_details
                cmd.completed_at = completed_at
                return cmd
        msg = f"Command {command_id} not found"
        raise ValueError(msg)

    def _apply_filters(self, filters: CommandsQueryFilters) -> list[UnitCommand]:
        results = list(self._history)
        if filters.batch_id is not None:
            results = [c for c in results if c.batch_id == filters.batch_id]
        if filters.template_id is not None:
            results = [c for c in results if c.template_id == filters.template_id]
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
    ) -> list[UnitCommand]:
        results = self._apply_filters(filters)
        if sort == SortOrder.DESC:
            results = list(reversed(results))
        if offset is not None:
            results = results[offset:]
        if limit is not None:
            results = results[:limit]
        return results

    async def get_commands_by_ids(self, ids: list[int]) -> list[UnitCommand]:
        id_set = set(ids)
        return [c for c in self._history if c.id in id_set]

    async def count_commands(self, filters: CommandsQueryFilters) -> int:
        return len(self._apply_filters(filters))

    # -- command templates --

    async def save_template(self, template: CommandTemplate) -> CommandTemplate:
        self._templates[template.id] = template
        return template

    async def get_template(self, template_id: str) -> CommandTemplate | None:
        return self._templates.get(template_id)

    async def list_templates(
        self, *, limit: int | None = None, offset: int | None = None
    ) -> list[CommandTemplate]:
        named = [t for t in self._templates.values() if t.name is not None]
        named.sort(key=lambda t: t.created_at)
        if offset is not None:
            named = named[offset:]
        if limit is not None:
            named = named[:limit]
        return named

    async def count_templates(self) -> int:
        return sum(1 for t in self._templates.values() if t.name is not None)

    async def delete_template(self, template_id: str) -> None:
        # Demote to ephemeral (mirrors the SQL ``UPDATE SET name = NULL``).
        # Historical unit commands keep their ``template_id`` pointer; the
        # eventual cleanup pass is what actually removes the row.
        template = self._templates.get(template_id)
        if template is not None:
            template.name = None

    async def close(self) -> None:
        pass
