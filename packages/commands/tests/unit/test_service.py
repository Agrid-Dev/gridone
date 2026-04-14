from __future__ import annotations

from datetime import UTC, datetime
from unittest.mock import AsyncMock

import pytest

from commands.models import CommandStatus, WriteResult
from commands.service import CommandsService
from commands.storage.memory import MemoryStorage
from models.errors import InvalidError
from models.pagination import PaginationParams
from models.types import DataType

pytestmark = pytest.mark.asyncio


@pytest.fixture
def device_writer() -> AsyncMock:
    mock = AsyncMock()
    mock.return_value = WriteResult(last_changed=datetime(2026, 1, 2, tzinfo=UTC))
    return mock


@pytest.fixture
def result_handler() -> AsyncMock:
    return AsyncMock()


@pytest.fixture
def service(device_writer: AsyncMock, result_handler: AsyncMock) -> CommandsService:
    return CommandsService(
        storage=MemoryStorage(),
        device_writer=device_writer,
        result_handler=result_handler,
    )


class TestDispatch:
    async def test_success(
        self,
        service: CommandsService,
        device_writer: AsyncMock,
        result_handler: AsyncMock,
    ):
        cmd = await service.dispatch(
            device_id="d1",
            attribute="mode",
            value="auto",
            data_type=DataType.STRING,
            user_id="u1",
        )
        assert cmd.status == CommandStatus.SUCCESS
        assert cmd.device_id == "d1"
        assert cmd.completed_at is not None

        device_writer.assert_awaited_once_with("d1", "mode", "auto", confirm=True)
        result_handler.assert_awaited_once()

    async def test_error_marks_command_failed(
        self,
        service: CommandsService,
        device_writer: AsyncMock,
        result_handler: AsyncMock,
    ):
        device_writer.side_effect = RuntimeError("timeout")

        with pytest.raises(RuntimeError, match="timeout"):
            await service.dispatch(
                device_id="d1",
                attribute="mode",
                value="auto",
                data_type=DataType.STRING,
                user_id="u1",
            )

        result_handler.assert_not_awaited()

        # The command should be stored with ERROR status.
        page = await service.get_commands(device_id="d1")
        assert len(page.items) == 1
        assert page.items[0].status == CommandStatus.ERROR
        assert page.items[0].status_details is not None
        assert "timeout" in page.items[0].status_details

    async def test_group_id_stored(
        self,
        service: CommandsService,
    ):
        cmd = await service.dispatch(
            device_id="d1",
            attribute="mode",
            value="auto",
            data_type=DataType.STRING,
            user_id="u1",
            group_id="abc123",
        )
        assert cmd.group_id == "abc123"

    async def test_confirm_false(
        self,
        service: CommandsService,
        device_writer: AsyncMock,
    ):
        await service.dispatch(
            device_id="d1",
            attribute="mode",
            value="auto",
            data_type=DataType.STRING,
            user_id="u1",
            confirm=False,
        )
        device_writer.assert_awaited_once_with("d1", "mode", "auto", confirm=False)


class TestGetCommands:
    async def test_end_before_start_raises(self, service: CommandsService):
        with pytest.raises(ValueError, match="start must be before end"):
            await service.get_commands(
                start=datetime(2026, 2, 1, tzinfo=UTC),
                end=datetime(2026, 1, 1, tzinfo=UTC),
            )

    async def test_empty(self, service: CommandsService):
        page = await service.get_commands()
        assert page.items == []
        assert page.total == 0

    async def test_filter_by_device_id(self, service: CommandsService):
        await service.dispatch(
            device_id="d1",
            attribute="mode",
            value="auto",
            data_type=DataType.STRING,
            user_id="u1",
        )
        await service.dispatch(
            device_id="d2",
            attribute="mode",
            value="auto",
            data_type=DataType.STRING,
            user_id="u1",
        )
        page = await service.get_commands(device_id="d1")
        assert len(page.items) == 1
        assert page.items[0].device_id == "d1"

    async def test_by_ids(self, service: CommandsService):
        c1 = await service.dispatch(
            device_id="d1",
            attribute="mode",
            value="auto",
            data_type=DataType.STRING,
            user_id="u1",
        )
        await service.dispatch(
            device_id="d2",
            attribute="mode",
            value="auto",
            data_type=DataType.STRING,
            user_id="u1",
        )
        page = await service.get_commands(ids=[c1.id])
        assert len(page.items) == 1
        assert page.items[0].id == c1.id

    async def test_ids_with_other_filters_raises(self, service: CommandsService):
        with pytest.raises(InvalidError, match="Cannot combine"):
            await service.get_commands(ids=[1], device_id="d1")

    async def test_pagination(self, service: CommandsService):
        for i in range(5):
            await service.dispatch(
                device_id=f"d{i}",
                attribute="mode",
                value="auto",
                data_type=DataType.STRING,
                user_id="u1",
            )
        page = await service.get_commands(pagination=PaginationParams(page=2, size=2))
        assert len(page.items) == 2
        assert page.total == 5
        assert page.page == 2
        assert page.size == 2
