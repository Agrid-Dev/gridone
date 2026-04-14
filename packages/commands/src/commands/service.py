from __future__ import annotations

import logging
from datetime import UTC, datetime
from typing import TYPE_CHECKING

from commands.filters import CommandsQueryFilters
from commands.models import Command, CommandCreate, CommandStatus, SortOrder
from models.errors import InvalidError
from models.pagination import Page, PaginationParams

if TYPE_CHECKING:
    from commands.models import DataPointValue, WriteResult
    from commands.protocols import CommandResultHandler, DeviceWriter
    from commands.storage.protocol import CommandsStorage
    from models.types import DataType

logger = logging.getLogger(__name__)


class CommandsService:
    def __init__(
        self,
        storage: CommandsStorage,
        device_writer: DeviceWriter,
        result_handler: CommandResultHandler,
    ) -> None:
        self._storage = storage
        self._device_writer = device_writer
        self._result_handler = result_handler

    async def close(self) -> None:
        await self._storage.close()

    @classmethod
    async def from_storage(
        cls,
        storage_url: str,
        device_writer: DeviceWriter,
        result_handler: CommandResultHandler,
    ) -> CommandsService:
        from commands.storage import build_storage  # noqa: PLC0415

        storage = await build_storage(storage_url)
        return cls(storage, device_writer, result_handler)

    async def dispatch(  # noqa: PLR0913
        self,
        *,
        device_id: str,
        attribute: str,
        value: DataPointValue,
        data_type: DataType,
        user_id: str,
        confirm: bool = True,
        group_id: str | None = None,
    ) -> Command:
        now = datetime.now(UTC)
        command = await self._storage.save_command(
            CommandCreate(
                group_id=group_id,
                device_id=device_id,
                attribute=attribute,
                value=value,
                data_type=data_type,
                status=CommandStatus.PENDING,
                status_details=None,
                user_id=user_id,
                created_at=now,
                executed_at=now,
                completed_at=None,
            )
        )

        try:
            result: WriteResult = await self._device_writer.write_device_attribute(
                device_id, attribute, value, confirm=confirm
            )
            completed_at = datetime.now(UTC)
            command = await self._storage.update_command_status(
                command.id,
                CommandStatus.SUCCESS,
                completed_at=completed_at,
            )
            await self._result_handler.on_command_success(
                device_id=device_id,
                attribute=attribute,
                value=value,
                data_type=data_type,
                command_id=command.id,
                last_changed=result.last_changed,
            )
        except Exception as exc:
            completed_at = datetime.now(UTC)
            command = await self._storage.update_command_status(
                command.id,
                CommandStatus.ERROR,
                status_details=str(exc),
                completed_at=completed_at,
            )
            raise

        return command

    async def get_commands(  # noqa: PLR0913
        self,
        *,
        ids: list[int] | None = None,
        group_id: str | None = None,
        device_id: str | None = None,
        attribute: str | None = None,
        user_id: str | None = None,
        start: datetime | None = None,
        end: datetime | None = None,
        sort: SortOrder = SortOrder.ASC,
        pagination: PaginationParams | None = None,
    ) -> Page[Command]:
        if ids is not None:
            other = (group_id, device_id, attribute, user_id, start, end)
            if any(f is not None for f in other):
                msg = "Cannot combine 'ids' with other filters"
                raise InvalidError(msg)
            items = await self._storage.get_commands_by_ids(ids)
            return Page(
                items=items,
                total=len(items),
                page=1,
                size=max(len(items), 1),
            )

        filters = CommandsQueryFilters(
            group_id=group_id,
            device_id=device_id,
            attribute=attribute,
            user_id=user_id,
            start=start,
            end=end,
        )
        total = await self._storage.count_commands(filters)
        if pagination is not None:
            items = await self._storage.get_commands(
                filters,
                sort=sort,
                limit=pagination.limit,
                offset=pagination.offset,
            )
            return Page(
                items=items, total=total, page=pagination.page, size=pagination.size
            )
        items = await self._storage.get_commands(filters, sort=sort)
        return Page(items=items, total=total, page=1, size=max(total, 1))
