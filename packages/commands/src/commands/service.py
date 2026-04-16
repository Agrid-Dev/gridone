from __future__ import annotations

import asyncio
import logging
from datetime import UTC, datetime
from typing import TYPE_CHECKING
from uuid import uuid4

from commands.filters import CommandsQueryFilters
from commands.models import Command, CommandCreate, CommandStatus
from models.errors import InvalidError
from models.pagination import Page, PaginationParams
from models.types import SortOrder

if TYPE_CHECKING:
    from commands.models import WriteResult
    from commands.protocols import CommandResultHandler, DeviceWriter
    from commands.storage.protocol import CommandsStorage
    from models.types import AttributeValueType, DataType

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
        self._tasks: set[asyncio.Task[None]] = set()

    async def close(self) -> None:
        if self._tasks:
            await asyncio.gather(*self._tasks, return_exceptions=True)
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
        value: AttributeValueType,
        data_type: DataType,
        user_id: str,
        confirm: bool = True,
        group_id: str | None = None,
    ) -> Command:
        """Dispatch a command to a single device synchronously.

        Always returns the persisted :class:`Command` — its ``status`` reflects
        the outcome (``SUCCESS`` or ``ERROR``) and ``status_details`` carries
        the failure reason when the writer raises. Writer exceptions are
        absorbed so callers can rely on the returned record instead of error
        handling at every call site.
        """
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
            result: WriteResult = await self._device_writer(
                device_id, attribute, value, confirm=confirm
            )
        except Exception as exc:  # noqa: BLE001
            completed_at = datetime.now(UTC)
            return await self._storage.update_command_status(
                command.id,
                CommandStatus.ERROR,
                status_details=str(exc),
                completed_at=completed_at,
            )

        completed_at = datetime.now(UTC)
        command = await self._storage.update_command_status(
            command.id,
            CommandStatus.SUCCESS,
            completed_at=completed_at,
        )
        await self._result_handler(
            device_id=device_id,
            attribute=attribute,
            value=value,
            data_type=data_type,
            command_id=command.id,
            last_changed=result.last_changed,
        )
        return command

    async def dispatch_batch(  # noqa: PLR0913
        self,
        *,
        device_ids: list[str],
        attribute: str,
        value: AttributeValueType,
        data_type: DataType,
        user_id: str,
        confirm: bool = True,
    ) -> tuple[str, int]:
        """Fan-out a command to many devices as a single group.

        Persists pending command rows for each device, spawns a single background
        task that runs all per-device writes concurrently, and returns
        ``(group_id, total)`` immediately. The background task updates each
        command's status as results come in. Per-device exceptions are absorbed
        into ``ERROR`` status without affecting other devices in the batch. If
        the wrapping task itself fails unexpectedly, any commands still in
        ``PENDING`` are marked as ``ERROR``.
        """
        group_id = uuid4().hex[:16]
        now = datetime.now(UTC)
        commands = await self._storage.save_commands(
            [
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
                for device_id in device_ids
            ]
        )

        task = asyncio.create_task(
            self._execute_batch(commands, attribute, value, data_type, confirm=confirm)
        )
        self._tasks.add(task)
        task.add_done_callback(self._tasks.discard)

        return group_id, len(commands)

    async def _execute_batch(
        self,
        commands: list[Command],
        attribute: str,
        value: AttributeValueType,
        data_type: DataType,
        *,
        confirm: bool,
    ) -> None:
        try:
            await asyncio.gather(
                *(
                    self._execute_one(cmd, attribute, value, data_type, confirm=confirm)
                    for cmd in commands
                ),
                return_exceptions=True,
            )
        except Exception:
            logger.exception("Unexpected failure during batch command execution")
            await self._fail_remaining_pending(commands)

    async def _execute_one(
        self,
        command: Command,
        attribute: str,
        value: AttributeValueType,
        data_type: DataType,
        *,
        confirm: bool,
    ) -> None:
        """Execute a single command, absorbing exceptions into ERROR status."""
        try:
            result: WriteResult = await self._device_writer(
                command.device_id, attribute, value, confirm=confirm
            )
            completed_at = datetime.now(UTC)
            updated = await self._storage.update_command_status(
                command.id,
                CommandStatus.SUCCESS,
                completed_at=completed_at,
            )
            await self._result_handler(
                device_id=command.device_id,
                attribute=attribute,
                value=value,
                data_type=data_type,
                command_id=updated.id,
                last_changed=result.last_changed,
            )
        except Exception as exc:  # noqa: BLE001
            logger.warning(
                "Command %s failed for device %s: %s",
                command.id,
                command.device_id,
                exc,
            )
            completed_at = datetime.now(UTC)
            try:
                await self._storage.update_command_status(
                    command.id,
                    CommandStatus.ERROR,
                    status_details=str(exc),
                    completed_at=completed_at,
                )
            except Exception:
                logger.exception(
                    "Failed to mark command %s as ERROR after writer failure",
                    command.id,
                )

    async def _fail_remaining_pending(self, commands: list[Command]) -> None:
        """Mark any commands still in PENDING as ERROR after a wrapper failure."""
        completed_at = datetime.now(UTC)
        try:
            refreshed = await self._storage.get_commands_by_ids(
                [c.id for c in commands]
            )
        except Exception:
            logger.exception("Failed to re-read commands after batch failure")
            return
        for cmd in refreshed:
            if cmd.status != CommandStatus.PENDING:
                continue
            try:
                await self._storage.update_command_status(
                    cmd.id,
                    CommandStatus.ERROR,
                    status_details="batch execution failed unexpectedly",
                    completed_at=completed_at,
                )
            except Exception:
                logger.exception("Failed to mark stalled command %s as ERROR", cmd.id)

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
