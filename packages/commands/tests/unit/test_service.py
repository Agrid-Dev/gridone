from __future__ import annotations

import asyncio
import logging
from datetime import UTC, datetime
from unittest.mock import AsyncMock

import pytest
import pytest_asyncio

from commands.models import (
    AttributeWrite,
    CommandStatus,
    CommandTemplateCreate,
    WriteResult,
)
from commands.service import CommandsService
from commands.storage import MemoryStorage
from models.errors import (
    InvalidError,
    NotFoundError,
    StorageConnectionError,
    UnsupportedStorageError,
)
from models.pagination import PaginationParams
from models.service import Service
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


def _make_service(
    device_writer: AsyncMock,
    result_handler: AsyncMock,
    target_resolver: AsyncMock,
    *,
    storage_url: str | None = None,
) -> CommandsService:
    return CommandsService(
        storage_url,
        device_writer=device_writer,
        result_handler=result_handler,
        target_resolver=target_resolver,
    )


@pytest.fixture
def storage_backend() -> MemoryStorage:
    return MemoryStorage()


@pytest_asyncio.fixture
async def service(
    device_writer: AsyncMock,
    result_handler: AsyncMock,
    target_resolver: AsyncMock,
    storage_backend: MemoryStorage,
):
    svc = CommandsService(
        storage_url=None,
        device_writer=device_writer,
        result_handler=result_handler,
        target_resolver=target_resolver,
        storage=storage_backend,
    )
    await svc.start()
    yield svc
    await svc.stop()


class TestCommandsServiceProtocol:
    async def test_satisfies_service_protocol(
        self,
        device_writer: AsyncMock,
        result_handler: AsyncMock,
        target_resolver: AsyncMock,
    ):
        svc = _make_service(device_writer, result_handler, target_resolver)
        assert isinstance(svc, Service)


class TestCommandsServiceLifecycle:
    async def test_start_stop_in_memory_mode(
        self,
        device_writer: AsyncMock,
        result_handler: AsyncMock,
        target_resolver: AsyncMock,
    ):
        svc = _make_service(device_writer, result_handler, target_resolver)
        await svc.start()
        # Memory storage is wired and usable.
        page = await svc.get_commands()
        assert page.items == []
        await svc.stop()
        # Stop is idempotent.
        await svc.stop()

    async def test_start_unsupported_url_scheme(
        self,
        device_writer: AsyncMock,
        result_handler: AsyncMock,
        target_resolver: AsyncMock,
    ):
        svc = _make_service(
            device_writer,
            result_handler,
            target_resolver,
            storage_url="redis://nope",
        )
        with pytest.raises(UnsupportedStorageError):
            await svc.start()

    async def test_start_postgres_failure_wrapped(
        self,
        device_writer: AsyncMock,
        result_handler: AsyncMock,
        target_resolver: AsyncMock,
        monkeypatch: pytest.MonkeyPatch,
    ):
        async def fake_postgres_build(_url: str):  # noqa: ANN202
            msg = "boom"
            raise RuntimeError(msg)

        monkeypatch.setattr(
            "commands.storage.postgres.build_postgres_storage", fake_postgres_build
        )
        svc = _make_service(
            device_writer,
            result_handler,
            target_resolver,
            storage_url="postgresql://nope",
        )
        with pytest.raises(StorageConnectionError):
            await svc.start()


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

        dispatch = await service.dispatch_batch(
            target={"ids": ["d1", "d2", "d3"]},
            write=MODE_AUTO,
            user_id="u1",
        )

        assert len(dispatch.commands) == 3
        # Commands are returned in the resolver order with a shared batch_id
        # and PENDING status before the background task has a chance to run.
        assert [c.device_id for c in dispatch.commands] == ["d1", "d2", "d3"]
        # The dispatch's batch_id is stamped on every unit command.
        assert len(dispatch.batch_id) == 16
        assert all(c.batch_id == dispatch.batch_id for c in dispatch.commands)
        assert all(c.status == CommandStatus.PENDING for c in dispatch.commands)

        # Storage reflects the same PENDING state while the writer is blocked.
        page = await service.get_commands(batch_id=dispatch.batch_id)
        assert len(page.items) == 3
        assert all(c.status == CommandStatus.PENDING for c in page.items)

        gate.set()
        await service.await_pending_tasks()

    async def test_every_batch_creates_an_ephemeral_template(
        self,
        service: CommandsService,
        storage_backend: MemoryStorage,
        target_resolver: AsyncMock,
    ):
        target = {"types": ["thermostat"], "tags": {"asset_id": ["a1"]}}
        target_resolver.resolve.side_effect = None
        target_resolver.resolve.return_value = ["t1", "t2"]

        dispatch = await service.dispatch_batch(
            target=target,
            write=MODE_AUTO,
            user_id="u1",
        )
        await service.await_pending_tasks()

        # Every unit row links to the same auto-created ephemeral template
        # and the resolver is called with the stored target (not the raw one).
        template_ids = {c.template_id for c in dispatch.commands}
        assert len(template_ids) == 1
        template_id = next(iter(template_ids))
        assert template_id is not None
        target_resolver.resolve.assert_awaited_once_with(target)

        # The ephemeral template is persisted on the storage layer — we
        # reach into it directly because the public ``get_template`` only
        # surfaces user-saved templates, not ephemerals.
        template = await storage_backend.get_template(template_id)
        assert template is not None
        assert template.name is None
        assert template.target == target
        assert template.write == MODE_AUTO
        assert template.created_by == "u1"

        # Ephemerals don't leak into the named-templates list or into the
        # public ``get_template`` surface.
        page = await service.list_templates()
        assert page.total == 0
        with pytest.raises(NotFoundError):
            await service.get_template(template_id)

    async def test_ids_only_batch_also_creates_a_template(
        self,
        service: CommandsService,
        storage_backend: MemoryStorage,
    ):
        # A unified dispatch path means explicit-ids batches now also
        # create an ephemeral template. Every batch is template-backed;
        # a cleanup job sweeps ephemerals later.
        dispatch = await service.dispatch_batch(
            target={"ids": ["d1", "d2"]},
            write=MODE_AUTO,
            user_id="u1",
        )
        await service.await_pending_tasks()

        template_ids = {c.template_id for c in dispatch.commands}
        assert len(template_ids) == 1
        template_id = next(iter(template_ids))
        assert template_id is not None

        template = await storage_backend.get_template(template_id)
        assert template is not None
        assert template.name is None
        assert template.target == {"ids": ["d1", "d2"]}

    async def test_empty_resolve_returns_empty_dispatch(
        self,
        service: CommandsService,
        target_resolver: AsyncMock,
        device_writer: AsyncMock,
        caplog: pytest.LogCaptureFixture,
    ):
        target_resolver.resolve.side_effect = None
        target_resolver.resolve.return_value = []

        with caplog.at_level(logging.WARNING, logger="commands.service"):
            dispatch = await service.dispatch_batch(
                target={"types": ["unknown_type"]},
                write=MODE_AUTO,
                user_id="u1",
            )

        # batch_id is generated even on empty resolve so the attempt is
        # observable; commands is empty and no rows are persisted.
        assert dispatch.commands == []
        assert len(dispatch.batch_id) == 16
        device_writer.assert_not_awaited()
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
        dispatch = await service.dispatch_batch(
            target={"ids": ["d1", "d2", "d3"]},
            write=MODE_AUTO,
            user_id="u1",
        )
        await service.await_pending_tasks()

        page = await service.get_commands(batch_id=dispatch.batch_id)
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

        dispatch = await service.dispatch_batch(
            target={"ids": ["d1", "d2", "d3"]},
            write=MODE_AUTO,
            user_id="u1",
        )
        await service.await_pending_tasks()

        page = await service.get_commands(batch_id=dispatch.batch_id)
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

        dispatch = await service.dispatch_batch(
            target={"ids": ["d1", "d2"]},
            write=MODE_AUTO,
            user_id="u1",
        )
        await service.await_pending_tasks()

        page = await service.get_commands(batch_id=dispatch.batch_id)
        assert all(c.status == CommandStatus.ERROR for c in page.items)
        result_handler.assert_not_awaited()

    async def test_await_pending_noop_when_no_tasks(
        self,
        service: CommandsService,
    ):
        # Safe to call on a freshly-constructed service that has no in-flight
        # background tasks.
        await service.await_pending_tasks()

    async def test_stop_awaits_in_flight_tasks(
        self,
        device_writer: AsyncMock,
        result_handler: AsyncMock,
        target_resolver: AsyncMock,
    ):
        # Use a service we control end-to-end so the fixture's teardown
        # doesn't double-stop the same instance.
        svc = _make_service(device_writer, result_handler, target_resolver)
        await svc.start()

        gate = asyncio.Event()

        async def slow_writer(*_args: object, **_kwargs: object) -> WriteResult:
            await gate.wait()
            return WriteResult(last_changed=datetime(2026, 1, 2, tzinfo=UTC))

        device_writer.side_effect = slow_writer

        await svc.dispatch_batch(
            target={"ids": ["d1", "d2"]},
            write=MODE_AUTO,
            user_id="u1",
        )

        # Release the writer slightly after kicking off stop().
        async def releaser() -> None:
            await asyncio.sleep(0)
            gate.set()

        release_task = asyncio.create_task(releaser())
        await svc.stop()
        await release_task

        # stop() drained the in-flight batch before returning.
        assert svc.pending_tasks_count == 0
        assert result_handler.await_count == 2

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
        await service.await_pending_tasks()
        # A second call should be a no-op and not hang.
        await service.await_pending_tasks()


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

    async def test_delete_template_demotes_to_ephemeral(
        self,
        service: CommandsService,
        storage_backend: MemoryStorage,
    ):
        template = await service.save_template(
            CommandTemplateCreate(
                target={"ids": ["d1", "d2"]}, write=MODE_AUTO, name="To go"
            ),
            user_id="u1",
        )
        dispatch = await service.dispatch_from_template(
            template_id=template.id, user_id="u1"
        )
        await service.await_pending_tasks()
        assert all(c.template_id == template.id for c in dispatch.commands)

        await service.delete_template(template.id)

        # The template is gone from the user's view…
        with pytest.raises(NotFoundError):
            await service.get_template(template.id)
        page = await service.list_templates()
        assert page.total == 0

        # …but the row survives with ``name = NULL`` so historical unit
        # commands keep their ``template_id`` pointer for audit. A later
        # cleanup job reaps the row and the SQL cascade detaches history
        # at that point.
        demoted = await storage_backend.get_template(template.id)
        assert demoted is not None
        assert demoted.name is None
        history = await service.get_commands(batch_id=dispatch.batch_id)
        assert all(c.template_id == template.id for c in history.items)

    async def test_delete_template_raises_on_unknown_id(
        self,
        service: CommandsService,
    ):
        with pytest.raises(NotFoundError):
            await service.delete_template("does-not-exist")

    async def test_delete_template_raises_when_already_ephemeral(
        self,
        service: CommandsService,
    ):
        template = await service.save_template(
            CommandTemplateCreate(
                target={"ids": ["d1"]}, write=MODE_AUTO, name="One shot"
            ),
            user_id="u1",
        )
        await service.delete_template(template.id)
        with pytest.raises(NotFoundError):
            await service.delete_template(template.id)

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

        dispatch = await service.dispatch_from_template(
            template_id=template.id, user_id="u2"
        )
        await service.await_pending_tasks()

        target_resolver.resolve.assert_awaited_with({"types": ["thermostat"]})
        assert [c.device_id for c in dispatch.commands] == ["t1", "t2"]
        assert all(c.template_id == template.id for c in dispatch.commands)
        # user_id on commands is whoever dispatched, not who saved the template.
        assert all(c.user_id == "u2" for c in dispatch.commands)

    async def test_dispatch_from_template_raises_on_unknown_id(
        self,
        service: CommandsService,
    ):
        with pytest.raises(NotFoundError):
            await service.dispatch_from_template(
                template_id="does-not-exist", user_id="u1"
            )

    async def test_dispatch_from_template_refuses_ephemeral_templates(
        self,
        service: CommandsService,
    ):
        # Ephemerals live on the storage layer for audit but are not
        # dispatchable by id through the public API — a user holding an
        # ephemeral id cannot bypass the "saved templates only" contract.
        ephemeral = await service.save_template(
            CommandTemplateCreate(target={"ids": ["d1"]}, write=MODE_AUTO, name=None),
            user_id="u1",
        )
        with pytest.raises(NotFoundError):
            await service.dispatch_from_template(template_id=ephemeral.id, user_id="u1")
