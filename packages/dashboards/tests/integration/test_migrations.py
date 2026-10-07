"""Upgrading a deployment: what the migrations make of existing rows."""

from __future__ import annotations

import json
import os
from datetime import UTC, datetime
from urllib.parse import urlsplit, urlunsplit

import asyncpg
import pytest
from dashboards.models import DashboardCreate
from dashboards.service import DashboardsService
from dashboards.storage.postgres import MIGRATIONS_PATH
from dashboards.structure import DashboardStructureUpdate
from yoyo import get_backend, read_migrations

from models.ids import gen_id

POSTGRES_URL = os.environ.get("POSTGRES_TEST_URL")

pytestmark = [
    pytest.mark.asyncio,
    pytest.mark.integration,
    pytest.mark.skipif(POSTGRES_URL is None, reason="POSTGRES_TEST_URL not set"),
]


async def _database_migrated_up_to(admin: asyncpg.Connection, last: str) -> str:
    """A throwaway database on which only the migrations up to ``last``
    (inclusive, by id prefix) have run; the next service start runs the rest."""
    assert POSTGRES_URL is not None
    database = "dashboards_test_" + gen_id()
    await admin.execute(f'CREATE DATABASE "{database}"')
    url = urlunsplit(urlsplit(POSTGRES_URL)._replace(path="/" + database))
    backend = get_backend(url)
    applied = read_migrations(str(MIGRATIONS_PATH)).filter(
        lambda migration: migration.id[:4] <= last
    )
    with backend.lock():
        backend.apply_migrations(backend.to_apply(applied))
    return url


async def _listed_ids(url: str) -> list[str]:
    service = DashboardsService(storage_url=url)
    await service.start()
    try:
        return [s.id for s in (await service.list()).items]
    finally:
        await service.stop()


async def test_existing_dashboards_keep_creation_order():
    assert POSTGRES_URL is not None
    admin = await asyncpg.connect(POSTGRES_URL)
    url = await _database_migrated_up_to(admin, "0001")
    try:
        connection = await asyncpg.connect(url)
        # Ids sort the other way round from creation time, so an ordering that
        # silently fell back to the primary key would be caught.
        await connection.executemany(
            "INSERT INTO dashboards (id, name, created_at, updated_at)"
            " VALUES ($1, $1, $2, $2)",
            [
                ("z-first", datetime(2026, 1, 1, tzinfo=UTC)),
                ("m-second", datetime(2026, 1, 2, tzinfo=UTC)),
                ("a-third", datetime(2026, 1, 3, tzinfo=UTC)),
            ],
        )
        await connection.close()

        assert await _listed_ids(url) == ["z-first", "m-second", "a-third"]
    finally:
        await admin.execute(f'DROP DATABASE "{url.rsplit("/", 1)[1]}" WITH (FORCE)')
        await admin.close()


async def test_existing_dashboards_have_no_icon():
    assert POSTGRES_URL is not None
    admin = await asyncpg.connect(POSTGRES_URL)
    url = await _database_migrated_up_to(admin, "0002")
    try:
        connection = await asyncpg.connect(url)
        await connection.execute(
            "INSERT INTO dashboards (id, name, position) VALUES ('legacy', 'Legacy', 0)"
        )
        await connection.close()

        service = DashboardsService(storage_url=url)
        await service.start()
        try:
            assert (await service.list()).items[0].icon is None
            assert (await service.get("legacy")).icon is None
        finally:
            await service.stop()
    finally:
        await admin.execute(f'DROP DATABASE "{url.rsplit("/", 1)[1]}" WITH (FORCE)')
        await admin.close()


def _stored_widget(widget_id: str, config: dict) -> dict:
    return {
        "id": widget_id,
        "config": config,
        "layout": {"x": 0, "y": 0, "w": 6, "h": 5},
        "metadata": {},
    }


async def test_existing_charts_plot_a_list_of_targets():
    assert POSTGRES_URL is not None
    target = {"devices": {"ids": ["d1"]}, "attribute": "temperature"}
    text = {"type": "text", "text": "hi", "color": "#1a2b3c"}
    widgets = [
        _stored_widget("text", text),
        _stored_widget("single", {"type": "chart", "target": target, "agg": "avg"}),
        _stored_widget(
            "pre-target",
            {"type": "chart", "device_id": "d1", "attribute": "temperature"},
        ),
    ]
    admin = await asyncpg.connect(POSTGRES_URL)
    url = await _database_migrated_up_to(admin, "0003")
    try:
        connection = await asyncpg.connect(url)
        await connection.execute(
            "INSERT INTO dashboards (id, name, position, widgets)"
            " VALUES ('legacy', 'Legacy', 0, $1::jsonb)",
            json.dumps(widgets),
        )
        await connection.close()

        service = DashboardsService(storage_url=url)
        await service.start()
        try:
            migrated = (await service.get("legacy")).widgets
        finally:
            await service.stop()

        # Order and every other widget are left as stored.
        assert [w.id for w in migrated] == ["text", "single", "pre-target"]
        assert migrated[0].config.model_dump() == text
        single, pre_target = (w.config.model_dump() for w in migrated[1:])
        assert single["agg"] == "avg"
        for config in (single, pre_target):
            assert [
                (t["devices"]["ids"], t["attribute"]) for t in config["targets"]
            ] == [(["d1"], "temperature")]
    finally:
        await admin.execute(f'DROP DATABASE "{url.rsplit("/", 1)[1]}" WITH (FORCE)')
        await admin.close()


def _kpi(temporal: object | None) -> dict:
    config: dict = {
        "type": "kpi",
        "devices": {"ids": ["d1"]},
        "attributes": [{"label": "T", "attribute": "temperature"}],
    }
    if temporal is not None:
        config["temporal"] = temporal
    return config


async def test_existing_kpis_split_by_when_they_read():
    assert POSTGRES_URL is not None
    widgets = [
        _stored_widget("implicit-live", _kpi(None)),
        _stored_widget("live", _kpi("live")),
        _stored_widget("period", _kpi({"operator": "avg"})),
    ]
    admin = await asyncpg.connect(POSTGRES_URL)
    url = await _database_migrated_up_to(admin, "0004")
    try:
        connection = await asyncpg.connect(url)
        await connection.execute(
            "INSERT INTO dashboards (id, name, position, widgets)"
            " VALUES ('legacy', 'Legacy', 0, $1::jsonb)",
            json.dumps(widgets),
        )
        await connection.close()

        service = DashboardsService(storage_url=url)
        await service.start()
        try:
            migrated = (await service.get("legacy")).widgets
        finally:
            await service.stop()

        assert [(w.id, w.type, w.error) for w in migrated] == [
            ("implicit-live", "kpi_live", "incompatible_type"),
            ("live", "kpi_live", "incompatible_type"),
            ("period", "kpi_history", None),
        ]
        configs = [w.config.model_dump() for w in migrated]
        assert all("temporal" not in c for c in configs)
        assert all("agg" not in c for c in configs[:2])
        assert configs[2]["agg"] == "avg"
        # Everything else on the widget is left as stored.
        assert configs[2]["attributes"] == [
            {
                "label": "T",
                "attribute": "temperature",
                "space_agg": None,
                "unit": None,
                "precision": None,
            }
        ]
    finally:
        await admin.execute(f'DROP DATABASE "{url.rsplit("/", 1)[1]}" WITH (FORCE)')
        await admin.close()


@pytest.mark.parametrize(
    ("widgets", "expected"),
    [
        ([], "live"),
        (
            [_stored_widget("t", {"type": "text", "text": "x", "color": "#000000"})],
            "live",
        ),
        ([_stored_widget("dc", {"type": "device_control", "device_id": "d1"})], "live"),
        (
            [
                _stored_widget("dc", {"type": "device_control", "device_id": "d1"}),
                _stored_widget(
                    "chart",
                    {
                        "type": "chart",
                        "targets": [{"devices": {"ids": ["d1"]}, "attribute": "t"}],
                    },
                ),
            ],
            "history",
        ),
        ([_stored_widget("kpi", _kpi({"operator": "sum"}))], "history"),
    ],
    ids=["empty", "text_only", "live_only", "mixed", "period_kpi"],
)
async def test_existing_dashboards_are_typed_by_what_they_hold(
    widgets: list[dict], expected: str
):
    # One period-bound widget makes a dashboard ``history``; a mixed one
    # keeps its live widgets, flagged on read until it is split by hand.
    assert POSTGRES_URL is not None
    admin = await asyncpg.connect(POSTGRES_URL)
    url = await _database_migrated_up_to(admin, "0004")
    try:
        connection = await asyncpg.connect(url)
        await connection.execute(
            "INSERT INTO dashboards (id, name, position, widgets)"
            " VALUES ('legacy', 'Legacy', 0, $1::jsonb)",
            json.dumps(widgets),
        )
        await connection.close()

        service = DashboardsService(storage_url=url)
        await service.start()
        try:
            dashboard = await service.get("legacy")
            assert dashboard.type == expected
            assert (await service.list()).items[0].type == expected
            misfits = [w.id for w in dashboard.widgets if w.error is not None]
            assert misfits == (
                ["dc"] if expected == "history" and len(widgets) > 1 else []
            )
        finally:
            await service.stop()
    finally:
        await admin.execute(f'DROP DATABASE "{url.rsplit("/", 1)[1]}" WITH (FORCE)')
        await admin.close()


async def test_existing_order_becomes_the_root_and_comes_back_on_rollback():
    # Before 0007 the order was one flat ``position``; after it, placement is
    # the structure document, seeded so that list is the root in the same
    # order. Rolling back rebuilds ``position`` from the document's
    # depth-first order, nested dashboards included.
    assert POSTGRES_URL is not None
    admin = await asyncpg.connect(POSTGRES_URL)
    url = await _database_migrated_up_to(admin, "0006")
    try:
        connection = await asyncpg.connect(url)
        await connection.executemany(
            "INSERT INTO dashboards (id, name, type, position, created_at)"
            " VALUES ($1, $2, 'live', $3, $4)",
            [
                ("c", "Third", 2, datetime(2024, 1, 1, tzinfo=UTC)),
                ("a", "First", 0, datetime(2024, 1, 2, tzinfo=UTC)),
                ("b", "Second", 1, datetime(2024, 1, 3, tzinfo=UTC)),
            ],
        )
        await connection.close()

        service = DashboardsService(storage_url=url)
        await service.start()
        try:
            structure = await service.get_structure()
            assert [(i.kind, i.id) for i in structure.items] == [
                ("dashboard", "a"),
                ("dashboard", "b"),
                ("dashboard", "c"),
            ]
            # Nest two of them, then add one the document does not place.
            await service.update_structure(
                DashboardStructureUpdate.model_validate(
                    {
                        "items": [
                            {
                                "kind": "section",
                                "label": "S",
                                "items": [
                                    {
                                        "kind": "group",
                                        "label": "G",
                                        "dashboards": ["c", "b"],
                                    }
                                ],
                            },
                            {"kind": "dashboard", "id": "a"},
                        ]
                    }
                )
            )
            await service.create(DashboardCreate(type="live", name="Fourth"))
        finally:
            await service.stop()

        backend = get_backend(url)
        migrations = read_migrations(str(MIGRATIONS_PATH)).filter(
            lambda migration: migration.id.startswith("0007")
        )
        with backend.lock():
            backend.rollback_migrations(backend.to_rollback(migrations))

        connection = await asyncpg.connect(url)
        rows = await connection.fetch(
            "SELECT id FROM dashboards ORDER BY position, created_at, id"
        )
        await connection.close()
        assert [r["id"] for r in rows][:3] == ["c", "b", "a"]
    finally:
        await admin.execute(f'DROP DATABASE "{url.rsplit("/", 1)[1]}" WITH (FORCE)')
        await admin.close()
