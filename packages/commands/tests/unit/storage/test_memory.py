from __future__ import annotations

from datetime import UTC, datetime
from typing import Any

import pytest

from commands.filters import CommandsQueryFilters
from commands.models import CommandCreate, CommandStatus, SortOrder
from commands.storage.memory import MemoryStorage
from models.types import DataType


def make_command(  # noqa: PLR0913
    *,
    group_id: str | None = None,
    device_id: str = "device1",
    attribute: str = "mode",
    user_id: str = "user1",
    value: Any = "auto",
    data_type: DataType = DataType.STRING,
    status: CommandStatus = CommandStatus.SUCCESS,
    created_at: datetime = datetime(2026, 1, 2, tzinfo=UTC),
) -> CommandCreate:
    return CommandCreate(
        group_id=group_id,
        device_id=device_id,
        attribute=attribute,
        value=value,
        data_type=data_type,
        status=status,
        status_details=None,
        user_id=user_id,
        created_at=created_at,
        executed_at=None,
        completed_at=None,
    )


pytestmark = pytest.mark.asyncio


@pytest.fixture
def storage() -> MemoryStorage:
    return MemoryStorage()


class TestSaveCommand:
    async def test_adds_command(self, storage: MemoryStorage):
        cmd = make_command()
        result = await storage.save_command(cmd)
        assert result.id == 1
        assert result.device_id == cmd.device_id

    async def test_increments_id(self, storage: MemoryStorage):
        c1 = await storage.save_command(make_command())
        c2 = await storage.save_command(make_command())
        assert c1.id == 1
        assert c2.id == 2


class TestSaveCommands:
    async def test_batch_save(self, storage: MemoryStorage):
        commands = [make_command(device_id=f"d{i}") for i in range(3)]
        results = await storage.save_commands(commands)
        assert len(results) == 3
        assert [r.id for r in results] == [1, 2, 3]


class TestUpdateCommandStatus:
    async def test_update_to_success(self, storage: MemoryStorage):
        cmd = await storage.save_command(make_command(status=CommandStatus.PENDING))
        completed = datetime.now(tz=UTC)
        updated = await storage.update_command_status(
            cmd.id, CommandStatus.SUCCESS, completed_at=completed
        )
        assert updated.status == CommandStatus.SUCCESS
        assert updated.completed_at == completed

    async def test_update_to_error_with_details(self, storage: MemoryStorage):
        cmd = await storage.save_command(make_command(status=CommandStatus.PENDING))
        updated = await storage.update_command_status(
            cmd.id, CommandStatus.ERROR, status_details="Connection timeout"
        )
        assert updated.status == CommandStatus.ERROR
        assert updated.status_details == "Connection timeout"

    async def test_not_found_raises(self, storage: MemoryStorage):
        with pytest.raises(ValueError, match="not found"):
            await storage.update_command_status(999, CommandStatus.ERROR)


class TestGetCommands:
    async def test_empty(self, storage: MemoryStorage):
        results = await storage.get_commands(CommandsQueryFilters())
        assert results == []

    async def test_no_filters_returns_all(self, storage: MemoryStorage):
        await storage.save_command(make_command(device_id="d1"))
        await storage.save_command(make_command(device_id="d2"))
        results = await storage.get_commands(CommandsQueryFilters())
        assert len(results) == 2

    async def test_filter_device_id(self, storage: MemoryStorage):
        await storage.save_command(make_command(device_id="d1"))
        await storage.save_command(make_command(device_id="d2"))
        results = await storage.get_commands(CommandsQueryFilters(device_id="d1"))
        assert len(results) == 1
        assert results[0].device_id == "d1"

    async def test_filter_group_id(self, storage: MemoryStorage):
        await storage.save_command(make_command(group_id="g1"))
        await storage.save_command(make_command(group_id="g2"))
        await storage.save_command(make_command(group_id=None))
        results = await storage.get_commands(CommandsQueryFilters(group_id="g1"))
        assert len(results) == 1
        assert results[0].group_id == "g1"

    async def test_filter_attribute(self, storage: MemoryStorage):
        await storage.save_command(make_command(attribute="mode"))
        await storage.save_command(make_command(attribute="setpoint"))
        results = await storage.get_commands(CommandsQueryFilters(attribute="setpoint"))
        assert len(results) == 1
        assert results[0].attribute == "setpoint"

    async def test_filter_user_id(self, storage: MemoryStorage):
        await storage.save_command(make_command(user_id="u1"))
        await storage.save_command(make_command(user_id="u2"))
        results = await storage.get_commands(CommandsQueryFilters(user_id="u1"))
        assert len(results) == 1
        assert results[0].user_id == "u1"

    async def test_filter_start(self, storage: MemoryStorage):
        t1 = datetime(2026, 1, 1, tzinfo=UTC)
        t2 = datetime(2026, 1, 2, tzinfo=UTC)
        t3 = datetime(2026, 1, 3, tzinfo=UTC)
        await storage.save_command(make_command(created_at=t1))
        await storage.save_command(make_command(created_at=t2))
        await storage.save_command(make_command(created_at=t3))
        results = await storage.get_commands(CommandsQueryFilters(start=t2))
        assert len(results) == 2

    async def test_filter_end(self, storage: MemoryStorage):
        t1 = datetime(2026, 1, 1, tzinfo=UTC)
        t2 = datetime(2026, 1, 2, tzinfo=UTC)
        t3 = datetime(2026, 1, 3, tzinfo=UTC)
        await storage.save_command(make_command(created_at=t1))
        await storage.save_command(make_command(created_at=t2))
        await storage.save_command(make_command(created_at=t3))
        results = await storage.get_commands(CommandsQueryFilters(end=t2))
        assert len(results) == 1

    async def test_combined_filters(self, storage: MemoryStorage):
        t1 = datetime(2026, 1, 1, tzinfo=UTC)
        t2 = datetime(2026, 1, 2, tzinfo=UTC)
        await storage.save_command(
            make_command(device_id="d1", user_id="u1", created_at=t1)
        )
        await storage.save_command(
            make_command(device_id="d1", user_id="u2", created_at=t2)
        )
        await storage.save_command(
            make_command(device_id="d2", user_id="u1", created_at=t2)
        )
        results = await storage.get_commands(
            CommandsQueryFilters(device_id="d1", user_id="u1")
        )
        assert len(results) == 1
        assert results[0].device_id == "d1"
        assert results[0].user_id == "u1"

    async def test_limit(self, storage: MemoryStorage):
        for i in range(5):
            await storage.save_command(make_command(device_id=f"d{i}"))
        results = await storage.get_commands(CommandsQueryFilters(), limit=3)
        assert len(results) == 3

    async def test_offset(self, storage: MemoryStorage):
        for i in range(5):
            await storage.save_command(make_command(device_id=f"d{i}"))
        results = await storage.get_commands(CommandsQueryFilters(), offset=2)
        assert len(results) == 3
        assert results[0].device_id == "d2"

    async def test_limit_and_offset(self, storage: MemoryStorage):
        for i in range(5):
            await storage.save_command(make_command(device_id=f"d{i}"))
        results = await storage.get_commands(CommandsQueryFilters(), limit=2, offset=1)
        assert len(results) == 2
        assert results[0].device_id == "d1"
        assert results[1].device_id == "d2"

    async def test_sort_asc(self, storage: MemoryStorage):
        t1 = datetime(2026, 1, 1, tzinfo=UTC)
        t2 = datetime(2026, 1, 2, tzinfo=UTC)
        t3 = datetime(2026, 1, 3, tzinfo=UTC)
        await storage.save_command(make_command(created_at=t1))
        await storage.save_command(make_command(created_at=t2))
        await storage.save_command(make_command(created_at=t3))
        results = await storage.get_commands(CommandsQueryFilters(), sort=SortOrder.ASC)
        assert [r.created_at for r in results] == [t1, t2, t3]

    async def test_sort_desc(self, storage: MemoryStorage):
        t1 = datetime(2026, 1, 1, tzinfo=UTC)
        t2 = datetime(2026, 1, 2, tzinfo=UTC)
        t3 = datetime(2026, 1, 3, tzinfo=UTC)
        await storage.save_command(make_command(created_at=t1))
        await storage.save_command(make_command(created_at=t2))
        await storage.save_command(make_command(created_at=t3))
        results = await storage.get_commands(
            CommandsQueryFilters(), sort=SortOrder.DESC
        )
        assert [r.created_at for r in results] == [t3, t2, t1]


class TestGetCommandsByIds:
    async def test_by_ids(self, storage: MemoryStorage):
        c1 = await storage.save_command(make_command(device_id="d1"))
        await storage.save_command(make_command(device_id="d2"))
        c3 = await storage.save_command(make_command(device_id="d3"))
        results = await storage.get_commands_by_ids([c1.id, c3.id])
        assert len(results) == 2
        assert {r.device_id for r in results} == {"d1", "d3"}

    async def test_empty_ids(self, storage: MemoryStorage):
        results = await storage.get_commands_by_ids([])
        assert results == []


class TestCountCommands:
    async def test_count_empty(self, storage: MemoryStorage):
        count = await storage.count_commands(CommandsQueryFilters())
        assert count == 0

    async def test_count_all(self, storage: MemoryStorage):
        await storage.save_command(make_command(device_id="d1"))
        await storage.save_command(make_command(device_id="d2"))
        count = await storage.count_commands(CommandsQueryFilters())
        assert count == 2

    async def test_count_with_filters(self, storage: MemoryStorage):
        await storage.save_command(make_command(device_id="d1"))
        await storage.save_command(make_command(device_id="d2"))
        await storage.save_command(make_command(device_id="d1"))
        count = await storage.count_commands(CommandsQueryFilters(device_id="d1"))
        assert count == 2
