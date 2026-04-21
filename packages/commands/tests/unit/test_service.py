from __future__ import annotations

import asyncio
import logging
from datetime import UTC, datetime
from unittest.mock import AsyncMock

import pytest

from commands.models import (
    AttributeWrite,
    CommandStatus,
    CommandTemplateCreate,
    WriteResult,
)
from commands.service import CommandsService
from commands.storage.memory import MemoryStorage
from models.errors import InvalidError, NotFoundError
from models.pagination import PaginationParams
from models.types import DataType

pytestmark = pytest.mark.asyncio


MODE_AUTO = AttributeWrite(attribute="mode", value="auto", data_type=DataType.STRING)


@pytest.fixture
def device_writer() -> AsyncMock:
    mock = AsyncMock()
    mock.return_value = WriteResult(last_changed=datetime(2026, 1, 2, tzinfo=UTC))
    return mock


@pytest.fixture
def result_handler() -> AsyncMock:
    return AsyncMock()


@pytest.fixture
def target_resolver() -> AsyncMock:
    """Mock resolver whose ``resolve`` returns whatever ``ids`` the target carries.

    Tests pass explicit id lists via ``{"ids": [...]}`` for predictability;
    the resolve-empty path is exercised by a dedicated test that clears
    ``side_effect``.
    """

    async def _resolve(target: dict) -> list[str]:
        return list(target.get("ids") or [])

    mock = AsyncMock()
    mock.resolve.side_effect = _resolve
    return mock


@pytest.fixture
def service(
    device_writer: AsyncMock,
    result_handler: AsyncMock,
    target_resolver: AsyncMock,
) -> CommandsService:
    return CommandsService(
        storage=MemoryStorage(),
        device_writer=device_writer,
        result_handler=result_handler,
        target_resolver=target_resolver,
    )


class TestDispatchUnit:
    async def test_success(
        self,
        service: CommandsService,
        device_writer: AsyncMock,
        result_handler: AsyncMock,
    ):
        cmd = await service.dispatch_unit(
            device_id="d1",
            write=MODE_AUTO,
            user_id="u1",
        )
        assert cmd.status == CommandStatus.SUCCESS
        assert cmd.device_id == "d1"
        assert cmd.completed_at is not None

        device_writer.assert_awaited_once_with("d1", "mode", "auto", confirm=True)
        result_handler.assert_awaited_once()

    async def test_error_returns_command_with_error_status(
        self,
        service: CommandsService,
        device_writer: AsyncMock,
        result_handler: AsyncMock,
    ):
        device_writer.side_effect = RuntimeError("timeout")

        cmd = await service.dispatch_unit(
            device_id="d1",
            write=MODE_AUTO,
            user_id="u1",
        )

        # dispatch_unit absorbs the writer exception and returns the ERROR command.
        assert cmd.status == CommandStatus.ERROR
        assert cmd.status_details is not None
        assert "timeout" in cmd.status_details
        assert cmd.completed_at is not None
        result_handler.assert_not_awaited()

    async def test_batch_id_stored(
        self,
        service: CommandsService,
    ):
        cmd = await service.dispatch_unit(
            device_id="d1",
            write=MODE_AUTO,
            user_id="u1",
            batch_id="abc123",
        )
        assert cmd.batch_id == "abc123"

    async def test_template_id_is_null_for_unit_dispatch(
        self,
        service: CommandsService,
    ):
        # Single-device writes are not template-backed; a thermostat click
        # shouldn't pollute the command_templates table.
        cmd = await service.dispatch_unit(
            device_id="d1",
            write=MODE_AUTO,
            user_id="u1",
        )
        assert cmd.template_id is None

    async def test_confirm_false(
        self,
        service: CommandsService,
        device_writer: AsyncMock,
    ):
        await service.dispatch_unit(
            device_id="d1",
            write=MODE_AUTO,
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
        await service.dispatch_unit(device_id="d1", write=MODE_AUTO, user_id="u1")
        await service.dispatch_unit(device_id="d2", write=MODE_AUTO, user_id="u1")
        page = await service.get_commands(device_id="d1")
        assert len(page.items) == 1
        assert page.items[0].device_id == "d1"

    async def test_by_ids(self, service: CommandsService):
        c1 = await service.dispatch_unit(device_id="d1", write=MODE_AUTO, user_id="u1")
        await service.dispatch_unit(device_id="d2", write=MODE_AUTO, user_id="u1")
        page = await service.get_commands(ids=[c1.id])
        assert len(page.items) == 1
        assert page.items[0].id == c1.id

    async def test_ids_with_other_filters_raises(self, service: CommandsService):
        with pytest.raises(InvalidError, match="Cannot combine"):
            await service.get_commands(ids=[1], device_id="d1")

    async def test_pagination(self, service: CommandsService):
        for i in range(5):
            await service.dispatch_unit(
                device_id=f"d{i}", write=MODE_AUTO, user_id="u1"
            )
        page = await service.get_commands(pagination=PaginationParams(page=2, size=2))
        assert len(page.items) == 2
        assert page.total == 5
        assert page.page == 2
        assert page.size == 2


class TestDispatchBatch:
    async def test_returns_pending_commands_immediately(
        self,
        service: CommandsService,
        device_writer: AsyncMock,
    ):
        # Block the writer so the background task is still pending when we
        # inspect the return value.
        gate = asyncio.Event()

        async def slow_writer(*_args: object, **_kwargs: object) -> WriteResult:
            await gate.wait()
            return WriteResult(last_changed=datetime(2026, 1, 2, tzinfo=UTC))

        device_writer.side_effect = slow_writer

        commands = await service.dispatch_batch(
            target={"ids": ["d1", "d2", "d3"]},
            write=MODE_AUTO,
            user_id="u1",
        )

        assert len(commands) == 3
        # Commands are returned in the resolver order with a shared batch_id
        # and PENDING status before the background task has a chance to run.
        assert [c.device_id for c in commands] == ["d1", "d2", "d3"]
        batch_ids = {c.batch_id for c in commands}
        assert len(batch_ids) == 1
        batch_id = commands[0].batch_id
        assert batch_id is not None
        assert len(batch_id) == 16
        assert all(c.status == CommandStatus.PENDING for c in commands)

        # Storage reflects the same PENDING state while the writer is blocked.
        page = await service.get_commands(batch_id=batch_id)
        assert len(page.items) == 3
        assert all(c.status == CommandStatus.PENDING for c in page.items)

        gate.set()
        await service.await_pending()

    async def test_every_batch_creates_an_ephemeral_template(
        self,
        service: CommandsService,
        target_resolver: AsyncMock,
    ):
        target = {"types": ["thermostat"], "tags": {"asset_id": ["a1"]}}
        target_resolver.resolve.side_effect = None
        target_resolver.resolve.return_value = ["t1", "t2"]

        commands = await service.dispatch_batch(
            target=target,
            write=MODE_AUTO,
            user_id="u1",
        )
        await service.await_pending()

        # Every unit row links to the same auto-created ephemeral template
        # and the resolver is called with the stored target (not the raw one).
        template_ids = {c.template_id for c in commands}
        assert len(template_ids) == 1
        template_id = next(iter(template_ids))
        assert template_id is not None
        target_resolver.resolve.assert_awaited_once_with(target)

        # The ephemeral template is persisted and accessible by id…
        template = await service.get_template(template_id)
        assert template.name is None
        assert template.target == target
        assert template.write == MODE_AUTO
        assert template.created_by == "u1"

        # …but does not leak into the named-templates list.
        page = await service.list_templates()
        assert page.total == 0

    async def test_ids_only_batch_also_creates_a_template(
        self,
        service: CommandsService,
    ):
        # A unified dispatch path means explicit-ids batches now also
        # create an ephemeral template. Every batch is template-backed;
        # a cleanup job sweeps ephemerals later.
        commands = await service.dispatch_batch(
            target={"ids": ["d1", "d2"]},
            write=MODE_AUTO,
            user_id="u1",
        )
        await service.await_pending()

        template_ids = {c.template_id for c in commands}
        assert len(template_ids) == 1
        template_id = next(iter(template_ids))
        assert template_id is not None

        template = await service.get_template(template_id)
        assert template.name is None
        assert template.target == {"ids": ["d1", "d2"]}

    async def test_empty_resolve_returns_empty_list(
        self,
        service: CommandsService,
        target_resolver: AsyncMock,
        device_writer: AsyncMock,
        caplog: pytest.LogCaptureFixture,
    ):
        target_resolver.resolve.side_effect = None
        target_resolver.resolve.return_value = []

        with caplog.at_level(logging.WARNING, logger="commands.service"):
            commands = await service.dispatch_batch(
                target={"types": ["unknown_type"]},
                write=MODE_AUTO,
                user_id="u1",
            )

        assert commands == []
        device_writer.assert_not_awaited()
        # No PENDING rows persisted.
        page = await service.get_commands()
        assert page.items == []
        # A warning was logged so operators can notice stale filters.
        assert any("resolved to no devices" in rec.message for rec in caplog.records)

    async def test_all_success(
        self,
        service: CommandsService,
        device_writer: AsyncMock,
        result_handler: AsyncMock,
    ):
        commands = await service.dispatch_batch(
            target={"ids": ["d1", "d2", "d3"]},
            write=MODE_AUTO,
            user_id="u1",
        )
        await service.await_pending()

        batch_id = commands[0].batch_id
        page = await service.get_commands(batch_id=batch_id)
        assert len(page.items) == 3
        assert all(c.status == CommandStatus.SUCCESS for c in page.items)
        assert device_writer.await_count == 3
        assert result_handler.await_count == 3

    async def test_partial_failure(
        self,
        service: CommandsService,
        device_writer: AsyncMock,
        result_handler: AsyncMock,
    ):
        async def writer(
            device_id: str, *_args: object, **_kwargs: object
        ) -> WriteResult:
            if device_id == "d2":
                msg = "device unreachable"
                raise RuntimeError(msg)
            return WriteResult(last_changed=datetime(2026, 1, 2, tzinfo=UTC))

        device_writer.side_effect = writer

        commands = await service.dispatch_batch(
            target={"ids": ["d1", "d2", "d3"]},
            write=MODE_AUTO,
            user_id="u1",
        )
        await service.await_pending()

        batch_id = commands[0].batch_id
        page = await service.get_commands(batch_id=batch_id)
        by_device = {c.device_id: c for c in page.items}
        assert by_device["d1"].status == CommandStatus.SUCCESS
        assert by_device["d2"].status == CommandStatus.ERROR
        assert by_device["d2"].status_details is not None
        assert "unreachable" in by_device["d2"].status_details
        assert by_device["d3"].status == CommandStatus.SUCCESS
        # result_handler is only called on success.
        assert result_handler.await_count == 2

    async def test_all_fail(
        self,
        service: CommandsService,
        device_writer: AsyncMock,
        result_handler: AsyncMock,
    ):
        device_writer.side_effect = RuntimeError("nope")

        commands = await service.dispatch_batch(
            target={"ids": ["d1", "d2"]},
            write=MODE_AUTO,
            user_id="u1",
        )
        await service.await_pending()

        batch_id = commands[0].batch_id
        page = await service.get_commands(batch_id=batch_id)
        assert all(c.status == CommandStatus.ERROR for c in page.items)
        result_handler.assert_not_awaited()

    async def test_await_pending_noop_when_no_tasks(
        self,
        service: CommandsService,
    ):
        # Safe to call on a freshly-constructed service that has no in-flight
        # background tasks.
        await service.await_pending()

    async def test_close_awaits_in_flight_tasks(
        self,
        service: CommandsService,
        device_writer: AsyncMock,
    ):
        gate = asyncio.Event()

        async def slow_writer(*_args: object, **_kwargs: object) -> WriteResult:
            await gate.wait()
            return WriteResult(last_changed=datetime(2026, 1, 2, tzinfo=UTC))

        device_writer.side_effect = slow_writer

        commands = await service.dispatch_batch(
            target={"ids": ["d1", "d2"]},
            write=MODE_AUTO,
            user_id="u1",
        )

        # Release the writer slightly after kicking off close().
        async def releaser() -> None:
            await asyncio.sleep(0)
            gate.set()

        release_task = asyncio.create_task(releaser())
        await service.close()
        await release_task

        batch_id = commands[0].batch_id
        page = await service.get_commands(batch_id=batch_id)
        assert all(c.status == CommandStatus.SUCCESS for c in page.items)

    async def test_await_pending_is_idempotent(
        self,
        service: CommandsService,
    ):
        # After the batch completes, await_pending should return instantly on
        # subsequent calls (no tasks pending).
        await service.dispatch_batch(
            target={"ids": ["d1"]},
            write=MODE_AUTO,
            user_id="u1",
        )
        await service.await_pending()
        # A second call should be a no-op and not hang.
        await service.await_pending()


class TestTemplateCrud:
    async def test_save_template_stamps_id_and_metadata(
        self,
        service: CommandsService,
    ):
        template = await service.save_template(
            CommandTemplateCreate(
                target={"ids": ["d1"]},
                write=MODE_AUTO,
                name="Thermostat to auto",
            ),
            user_id="u1",
        )
        # 16-char hex id per the CLAUDE.md convention.
        assert len(template.id) == 16
        int(template.id, 16)
        assert template.name == "Thermostat to auto"
        assert template.created_by == "u1"

    async def test_list_templates_excludes_ephemeral(
        self,
        service: CommandsService,
    ):
        await service.save_template(
            CommandTemplateCreate(
                target={"ids": ["d1"]}, write=MODE_AUTO, name="Saved"
            ),
            user_id="u1",
        )
        await service.save_template(
            CommandTemplateCreate(target={"ids": ["d2"]}, write=MODE_AUTO, name=None),
            user_id="u1",
        )

        page = await service.list_templates()
        assert page.total == 1
        assert page.items[0].name == "Saved"

    async def test_get_template_raises_on_unknown_id(
        self,
        service: CommandsService,
    ):
        with pytest.raises(NotFoundError):
            await service.get_template("does-not-exist")

    async def test_delete_template_detaches_historical_commands(
        self,
        service: CommandsService,
    ):
        template = await service.save_template(
            CommandTemplateCreate(
                target={"ids": ["d1", "d2"]}, write=MODE_AUTO, name="To go"
            ),
            user_id="u1",
        )
        commands = await service.dispatch_from_template(
            template_id=template.id, user_id="u1"
        )
        await service.await_pending()
        assert all(c.template_id == template.id for c in commands)

        await service.delete_template(template.id)

        with pytest.raises(NotFoundError):
            await service.get_template(template.id)

        # Historical unit commands survive with ``template_id`` detached,
        # mirroring the SQL ``ON DELETE SET NULL`` behaviour.
        page = await service.get_commands(batch_id=commands[0].batch_id)
        assert all(c.template_id is None for c in page.items)

    async def test_delete_template_raises_on_unknown_id(
        self,
        service: CommandsService,
    ):
        with pytest.raises(NotFoundError):
            await service.delete_template("does-not-exist")

    async def test_dispatch_from_template_uses_stored_target_and_write(
        self,
        service: CommandsService,
        target_resolver: AsyncMock,
    ):
        template = await service.save_template(
            CommandTemplateCreate(
                target={"types": ["thermostat"]},
                write=MODE_AUTO,
                name="All thermostats",
            ),
            user_id="u1",
        )
        target_resolver.resolve.side_effect = None
        target_resolver.resolve.return_value = ["t1", "t2"]

        commands = await service.dispatch_from_template(
            template_id=template.id, user_id="u2"
        )
        await service.await_pending()

        target_resolver.resolve.assert_awaited_with({"types": ["thermostat"]})
        assert [c.device_id for c in commands] == ["t1", "t2"]
        assert all(c.template_id == template.id for c in commands)
        # user_id on commands is whoever dispatched, not who saved the template.
        assert all(c.user_id == "u2" for c in commands)

    async def test_dispatch_from_template_raises_on_unknown_id(
        self,
        service: CommandsService,
    ):
        with pytest.raises(NotFoundError):
            await service.dispatch_from_template(
                template_id="does-not-exist", user_id="u1"
            )
