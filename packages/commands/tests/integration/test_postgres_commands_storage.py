"""Integration tests for ``PostgresCommandsStorage``.

Exercises the real asyncpg round-trip — serialisation of ``value`` and
``target``/``write`` jsonb, the ``ON DELETE SET NULL`` cascade, and the
``name IS NOT NULL`` filter on list/count. Opt-in via
``POSTGRES_TEST_URL``; skipped when unset so the default suite stays
hermetic.
"""

from __future__ import annotations

import os
from datetime import UTC, datetime

import pytest
import pytest_asyncio

from commands.filters import CommandsQueryFilters
from commands.models import (
    AttributeWrite,
    CommandStatus,
    CommandTemplate,
    UnitCommandCreate,
)
from commands.storage.postgres import (
    PostgresCommandsStorage,
    build_postgres_storage,
)
from models.errors import NotFoundError
from models.types import DataType, SortOrder

POSTGRES_URL = os.environ.get("POSTGRES_TEST_URL")

pytestmark = [
    pytest.mark.asyncio,
    pytest.mark.integration,
    pytest.mark.skipif(POSTGRES_URL is None, reason="POSTGRES_TEST_URL not set"),
]


MODE_AUTO = AttributeWrite(attribute="mode", value="auto", data_type=DataType.STRING)


def _unit(  # noqa: PLR0913
    *,
    device_id: str = "d1",
    batch_id: str | None = None,
    template_id: str | None = None,
    attribute: str = "mode",
    value: str | float = "auto",
    data_type: DataType = DataType.STRING,
    status: CommandStatus = CommandStatus.PENDING,
    user_id: str = "u1",
    created_at: datetime | None = None,
) -> UnitCommandCreate:
    now = created_at or datetime(2026, 4, 22, 10, 0, tzinfo=UTC)
    return UnitCommandCreate(
        batch_id=batch_id,
        template_id=template_id,
        device_id=device_id,
        attribute=attribute,
        value=value,
        data_type=data_type,
        status=status,
        status_details=None,
        user_id=user_id,
        created_at=now,
        executed_at=now,
        completed_at=None,
    )


def _template(
    *,
    template_id: str = "tpl0000000000001",
    name: str | None = "Thermostats to auto",
    target: dict | None = None,
    write: AttributeWrite = MODE_AUTO,
    created_by: str = "u1",
) -> CommandTemplate:
    return CommandTemplate(
        id=template_id,
        name=name,
        target=target or {"types": ["thermostat"]},
        write=write,
        created_at=datetime(2026, 4, 22, 10, 0, tzinfo=UTC),
        created_by=created_by,
    )


# ---------------------------------------------------------------------------
# Fixture
# ---------------------------------------------------------------------------


@pytest_asyncio.fixture
async def storage():
    """Real storage against ``POSTGRES_TEST_URL``.

    Builds the pool through :func:`build_postgres_storage` so the jsonb
    codec + yoyo migration wiring are both covered. Each test starts with
    empty tables — data is deleted in FK-safe order.
    """
    assert POSTGRES_URL is not None
    store = await build_postgres_storage(POSTGRES_URL)
    async with store._pool.acquire() as conn:
        await conn.execute("DELETE FROM unit_commands")
        await conn.execute("DELETE FROM command_templates")

    yield store

    await store.close()


# ---------------------------------------------------------------------------
# Unit commands
# ---------------------------------------------------------------------------


class TestSaveCommand:
    async def test_round_trips_all_fields(self, storage: PostgresCommandsStorage):
        saved = await storage.save_command(
            _unit(
                batch_id="b00001",
                device_id="thermo-1",
                attribute="setpoint",
                value=21.5,
                data_type=DataType.FLOAT,
                status=CommandStatus.SUCCESS,
                user_id="alice",
            )
        )
        assert saved.id > 0
        fetched = await storage.get_commands_by_ids([saved.id])
        assert len(fetched) == 1
        cmd = fetched[0]
        # value comes back as its native type thanks to deserialize_command_value
        assert cmd.value == 21.5
        assert cmd.data_type is DataType.FLOAT
        assert cmd.status is CommandStatus.SUCCESS
        assert cmd.batch_id == "b00001"
        assert cmd.user_id == "alice"

    async def test_save_commands_inserts_in_one_transaction(
        self, storage: PostgresCommandsStorage
    ):
        saved = await storage.save_commands(
            [_unit(batch_id="b1", device_id=f"d{i}") for i in range(3)]
        )
        assert len(saved) == 3
        assert {c.device_id for c in saved} == {"d0", "d1", "d2"}
        assert {c.batch_id for c in saved} == {"b1"}


class TestUpdateCommandStatus:
    async def test_updates_and_returns_row(self, storage: PostgresCommandsStorage):
        saved = await storage.save_command(_unit())
        completed = datetime(2026, 4, 22, 10, 5, tzinfo=UTC)
        updated = await storage.update_command_status(
            saved.id,
            CommandStatus.SUCCESS,
            completed_at=completed,
        )
        assert updated.status is CommandStatus.SUCCESS
        assert updated.completed_at == completed

    async def test_error_with_details(self, storage: PostgresCommandsStorage):
        saved = await storage.save_command(_unit())
        updated = await storage.update_command_status(
            saved.id,
            CommandStatus.ERROR,
            status_details="device unreachable",
        )
        assert updated.status is CommandStatus.ERROR
        assert updated.status_details == "device unreachable"

    async def test_unknown_id_raises_not_found(self, storage: PostgresCommandsStorage):
        with pytest.raises(NotFoundError, match="not found"):
            await storage.update_command_status(999_999, CommandStatus.SUCCESS)


class TestGetCommands:
    async def test_empty_ids_shortcircuits_without_query(
        self, storage: PostgresCommandsStorage
    ):
        # The early-return path skips the asyncpg call entirely.
        assert await storage.get_commands_by_ids([]) == []

    async def test_filters_sort_limit_offset(self, storage: PostgresCommandsStorage):
        # Insert rows spaced by timestamp so sort + offset are observable.
        for i in range(5):
            await storage.save_command(
                _unit(
                    batch_id="b-pagination",
                    device_id=f"d{i}",
                    user_id="alice",
                    created_at=datetime(2026, 4, 22, 10, i, tzinfo=UTC),
                )
            )
        # Row from a different batch + user — must be filtered out.
        await storage.save_command(_unit(batch_id="b-other", user_id="bob"))

        filters = CommandsQueryFilters(batch_id="b-pagination", user_id="alice")
        total = await storage.count_commands(filters)
        assert total == 5

        page = await storage.get_commands(
            filters, sort=SortOrder.DESC, limit=2, offset=1
        )
        # DESC by created_at → d4, d3, d2, d1, d0 → offset 1, limit 2 → d3, d2
        assert [c.device_id for c in page] == ["d3", "d2"]

    async def test_filter_by_attribute_and_time_range(
        self, storage: PostgresCommandsStorage
    ):
        t0 = datetime(2026, 4, 22, 10, 0, tzinfo=UTC)
        t1 = datetime(2026, 4, 22, 10, 10, tzinfo=UTC)
        t2 = datetime(2026, 4, 22, 10, 20, tzinfo=UTC)
        await storage.save_command(_unit(attribute="mode", created_at=t0))
        await storage.save_command(_unit(attribute="setpoint", created_at=t1))
        await storage.save_command(_unit(attribute="mode", created_at=t2))

        rows = await storage.get_commands(
            CommandsQueryFilters(
                attribute="mode",
                start=t0,
                end=t2,  # exclusive
            )
        )
        assert len(rows) == 1
        assert rows[0].created_at == t0

    async def test_filter_by_device_id(self, storage: PostgresCommandsStorage):
        await storage.save_command(_unit(device_id="d1"))
        await storage.save_command(_unit(device_id="d2"))

        rows = await storage.get_commands(CommandsQueryFilters(device_id="d1"))
        assert [c.device_id for c in rows] == ["d1"]


# ---------------------------------------------------------------------------
# Command templates
# ---------------------------------------------------------------------------


class TestTemplates:
    async def test_save_round_trips_target_and_write_as_jsonb(
        self, storage: PostgresCommandsStorage
    ):
        saved = await storage.save_template(
            _template(
                target={
                    "types": ["thermostat"],
                    "tags": {"asset_id": ["a1", "a2"]},
                    "is_faulty": False,
                },
                write=AttributeWrite(
                    attribute="setpoint", value=21.5, data_type=DataType.FLOAT
                ),
            )
        )
        fetched = await storage.get_template(saved.id)
        assert fetched is not None
        # jsonb codec restores the nested shape verbatim
        assert fetched.target == {
            "types": ["thermostat"],
            "tags": {"asset_id": ["a1", "a2"]},
            "is_faulty": False,
        }
        assert fetched.write == AttributeWrite(
            attribute="setpoint", value=21.5, data_type=DataType.FLOAT
        )

    async def test_get_template_returns_none_for_unknown(
        self, storage: PostgresCommandsStorage
    ):
        assert await storage.get_template("does-not-exist") is None

    async def test_list_and_count_exclude_ephemerals(
        self, storage: PostgresCommandsStorage
    ):
        await storage.save_template(
            _template(template_id="tpl0000000000001", name="Alpha")
        )
        await storage.save_template(
            _template(template_id="tpl0000000000002", name="Beta")
        )
        await storage.save_template(
            _template(template_id="tpl0000000000003", name=None)
        )

        assert await storage.count_templates() == 2
        named = await storage.list_templates()
        assert [t.name for t in named] == ["Alpha", "Beta"]

    async def test_list_templates_honours_limit_and_offset(
        self, storage: PostgresCommandsStorage
    ):
        # Stagger created_at so order is deterministic.
        for i in range(3):
            await storage.save_template(
                CommandTemplate(
                    id=f"tpl00000000000{i:02d}",
                    name=f"Saved {i}",
                    target={"ids": [f"d{i}"]},
                    write=MODE_AUTO,
                    created_at=datetime(2026, 4, 22, 10, i, tzinfo=UTC),
                    created_by="u1",
                )
            )
        page = await storage.list_templates(limit=1, offset=1)
        assert [t.name for t in page] == ["Saved 1"]

    async def test_delete_template_demotes_and_preserves_history(
        self, storage: PostgresCommandsStorage
    ):
        template = await storage.save_template(
            _template(template_id="tpl0000delete01", name="To go")
        )
        unit = await storage.save_command(
            _unit(batch_id="bdel", template_id=template.id)
        )

        await storage.delete_template(template.id)

        # Row survives with name nulled — no longer listed, still fetchable.
        demoted = await storage.get_template(template.id)
        assert demoted is not None
        assert demoted.name is None
        assert await storage.count_templates() == 0

        # Historical unit command keeps its template_id pointer.
        page = await storage.get_commands(CommandsQueryFilters(batch_id="bdel"))
        assert len(page) == 1
        assert page[0].template_id == template.id
        # Sanity: same row
        assert page[0].id == unit.id

    async def test_on_delete_set_null_cascade_detaches_history(
        self, storage: PostgresCommandsStorage
    ):
        # The service-level ``delete_template`` demotes; the actual DELETE
        # only happens when a cleanup job reaps the row. When it does, the
        # ``ON DELETE SET NULL`` on ``unit_commands.template_id`` kicks in
        # so historical rows end up detached instead of orphaned.
        template = await storage.save_template(
            _template(template_id="tplcascadetest1", name=None)
        )
        saved = await storage.save_command(
            _unit(batch_id="bcas", template_id=template.id)
        )

        async with storage._pool.acquire() as conn:
            await conn.execute(
                "DELETE FROM command_templates WHERE id = $1", template.id
            )

        rows = await storage.get_commands_by_ids([saved.id])
        assert len(rows) == 1
        assert rows[0].template_id is None
