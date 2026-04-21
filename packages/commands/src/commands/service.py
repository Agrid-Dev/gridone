from __future__ import annotations

import asyncio
import logging
from datetime import UTC, datetime
from typing import TYPE_CHECKING
from uuid import uuid4

from commands.filters import CommandsQueryFilters
from commands.models import CommandStatus, UnitCommand, UnitCommandCreate
from models.errors import InvalidError
from models.pagination import Page, PaginationParams
from models.types import SortOrder

if TYPE_CHECKING:
    from commands.models import Target
    from commands.protocols import (
        CommandResultHandler,
        DeviceWriter,
        TargetResolver,
    )
    from commands.storage.protocol import CommandsStorage
    from models.types import AttributeValueType, DataType

logger = logging.getLogger(__name__)


class CommandsService:
    def __init__(
        self,
        storage: CommandsStorage,
        device_writer: DeviceWriter,
        result_handler: CommandResultHandler,
        target_resolver: TargetResolver,
    ) -> None:
        self._storage = storage
        self._device_writer = device_writer
        self._result_handler = result_handler
        self._target_resolver = target_resolver
        self._tasks: set[asyncio.Task[object]] = set()

    async def await_pending(self) -> None:
        """Wait for all in-flight background tasks spawned by ``dispatch_batch``.

        Safe to call repeatedly and when no tasks are pending. Does not close
        the service — use :meth:`close` for shutdown.
        """
        if self._tasks:
            await asyncio.gather(*self._tasks, return_exceptions=True)

    async def close(self) -> None:
        await self.await_pending()
        await self._storage.close()

    @classmethod
    async def from_storage(
        cls,
        storage_url: str,
        device_writer: DeviceWriter,
        result_handler: CommandResultHandler,
        target_resolver: TargetResolver,
    ) -> CommandsService:
        from commands.storage import build_storage  # noqa: PLC0415

        storage = await build_storage(storage_url)
        return cls(storage, device_writer, result_handler, target_resolver)

    async def dispatch(  # noqa: PLR0913
        self,
        *,
        device_id: str,
        attribute: str,
        value: AttributeValueType,
        data_type: DataType,
        user_id: str,
        confirm: bool = True,
        batch_id: str | None = None,
    ) -> UnitCommand:
        """Dispatch a command to a single device, awaiting the result before returning.

        The method is a coroutine (it yields to the event loop while the write
        and status updates are in flight), but the caller is guaranteed to
        receive the fully resolved :class:`UnitCommand` before ``await``
        completes.

        Writer exceptions are absorbed: on failure the command is marked as
        ``ERROR`` (with ``status_details`` carrying the failure reason) and the
        updated record is returned. Callers inspect ``command.status`` instead
        of wrapping every call site in ``try/except``.
        """
        command = await self._storage.save_command(
            UnitCommandCreate(
                batch_id=batch_id,
                device_id=device_id,
                attribute=attribute,
                value=value,
                data_type=data_type,
                status=CommandStatus.PENDING,
                status_details=None,
                user_id=user_id,
                created_at=datetime.now(UTC),
                executed_at=datetime.now(UTC),
                completed_at=None,
            )
        )
        return await self._execute_command(
            command,
            attribute=attribute,
            value=value,
            data_type=data_type,
            confirm=confirm,
        )

    async def dispatch_batch(  # noqa: PLR0913
        self,
        *,
        target: Target,
        attribute: str,
        value: AttributeValueType,
        data_type: DataType,
        user_id: str,
        confirm: bool = True,
    ) -> list[UnitCommand]:
        """Fan-out a command to the devices matched by *target*.

        The injected :class:`TargetResolver` runs at dispatch time and returns
        the list of device ids the target currently matches. Each resolved
        device gets a ``PENDING`` unit command, all sharing one ``batch_id``.
        Per-device writes run concurrently in a background task; the persisted
        commands are returned immediately.

        When the target resolves to an empty set, the method logs a warning
        and returns ``[]`` — no exception, no PENDING rows created.
        """
        device_ids = await self._target_resolver.resolve(target)
        if not device_ids:
            logger.warning("dispatch_batch: target %r resolved to no devices", target)
            return []

        batch_id = uuid4().hex[:16]
        now = datetime.now(UTC)
        commands = await self._storage.save_commands(
            [
                UnitCommandCreate(
                    batch_id=batch_id,
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
            self._execute_all(
                commands,
                attribute=attribute,
                value=value,
                data_type=data_type,
                confirm=confirm,
            )
        )
        self._tasks.add(task)
        task.add_done_callback(self._tasks.discard)

        return commands

    async def _execute_all(
        self,
        commands: list[UnitCommand],
        *,
        attribute: str,
        value: AttributeValueType,
        data_type: DataType,
        confirm: bool,
    ) -> None:
        """Run ``_execute_command`` concurrently over every command in a batch.

        Per-command exceptions are absorbed by ``_execute_command`` itself;
        ``return_exceptions=True`` is a belt-and-braces guard against anything
        bubbling up from the storage layer.
        """
        await asyncio.gather(
            *(
                self._execute_command(
                    cmd,
                    attribute=attribute,
                    value=value,
                    data_type=data_type,
                    confirm=confirm,
                )
                for cmd in commands
            ),
            return_exceptions=True,
        )

    async def _execute_command(
        self,
        command: UnitCommand,
        *,
        attribute: str,
        value: AttributeValueType,
        data_type: DataType,
        confirm: bool,
    ) -> UnitCommand:
        """Write to the device, update command status, and fire the result handler.

        Writer exceptions are absorbed: the command is marked as ``ERROR`` and
        the updated record is returned. Status-update failures after a writer
        error are logged but not re-raised — the caller always receives a
        :class:`UnitCommand`.
        """
        try:
            result = await self._device_writer(
                command.device_id, attribute, value, confirm=confirm
            )
        except Exception as exc:  # noqa: BLE001
            logger.warning(
                "Command %s failed for device %s: %s",
                command.id,
                command.device_id,
                exc,
            )
            return await self._storage.update_command_status(
                command.id,
                CommandStatus.ERROR,
                status_details=str(exc),
                completed_at=datetime.now(UTC),
            )

        updated = await self._storage.update_command_status(
            command.id,
            CommandStatus.SUCCESS,
            completed_at=datetime.now(UTC),
        )
        await self._result_handler(
            device_id=command.device_id,
            attribute=attribute,
            value=value,
            data_type=data_type,
            command_id=updated.id,
            last_changed=result.last_changed,
        )
        return updated

    async def get_commands(  # noqa: PLR0913
        self,
        *,
        ids: list[int] | None = None,
        batch_id: str | None = None,
        device_id: str | None = None,
        attribute: str | None = None,
        user_id: str | None = None,
        start: datetime | None = None,
        end: datetime | None = None,
        sort: SortOrder = SortOrder.ASC,
        pagination: PaginationParams | None = None,
    ) -> Page[UnitCommand]:
        if ids is not None:
            other = (batch_id, device_id, attribute, user_id, start, end)
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
            batch_id=batch_id,
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
