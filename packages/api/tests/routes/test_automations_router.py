from __future__ import annotations

from datetime import UTC, datetime
from unittest.mock import AsyncMock, MagicMock

import pytest
from automations import (
    Automation,
    AutomationExecution,
    AutomationsServiceInterface,
)
from automations.models import ExecutionStatus, Trigger
from fastapi import FastAPI
from httpx import ASGITransport, AsyncClient
from models.errors import NotFoundError

from api.dependencies import (
    get_automations_service,
    get_current_token_payload,
    get_current_user_id,
)
from api.exception_handlers import register_exception_handlers
from api.routes.automations_router import router

pytestmark = pytest.mark.asyncio

_TRIGGER = Trigger.model_validate({"type": "schedule", "cron": "0 * * * *"})
_AUTO = Automation(
    id="auto-01",
    name="Morning Reset",
    trigger=_TRIGGER,
    action_template_id="tmpl-01",
    enabled=True,
)
_EXECUTION = AutomationExecution(
    id="exec-01",
    automation_id="auto-01",
    triggered_at=datetime(2024, 1, 1, tzinfo=UTC),
    executed_at=datetime(2024, 1, 1, 0, 0, 1, tzinfo=UTC),
    status=ExecutionStatus.SUCCESS,
)


@pytest.fixture
def svc() -> AsyncMock:
    mock = AsyncMock(spec=AutomationsServiceInterface)
    mock.list_trigger_schemas = MagicMock(return_value=[])
    return mock


@pytest.fixture
def app(svc, admin_token_payload) -> FastAPI:
    app = FastAPI()
    register_exception_handlers(app)
    app.include_router(router)
    app.dependency_overrides[get_automations_service] = lambda: svc
    app.dependency_overrides[get_current_token_payload] = lambda: admin_token_payload
    app.dependency_overrides[get_current_user_id] = lambda: admin_token_payload.sub
    return app


@pytest.fixture
def client(app) -> AsyncClient:
    return AsyncClient(transport=ASGITransport(app=app), base_url="http://test")


class TestListAutomations:
    async def test_returns_all(self, client, svc):
        svc.list.return_value = [_AUTO]
        async with client as c:
            resp = await c.get("/")
        assert resp.status_code == 200
        assert resp.json()[0]["id"] == "auto-01"

    async def test_filters_by_enabled(self, client, svc):
        svc.list.return_value = [_AUTO]
        async with client as c:
            resp = await c.get("/?enabled=true")
        assert resp.status_code == 200
        svc.list.assert_awaited_once_with(enabled=True)

    async def test_no_filter_passes_none(self, client, svc):
        svc.list.return_value = []
        async with client as c:
            await c.get("/")
        svc.list.assert_awaited_once_with(enabled=None)


class TestCreateAutomation:
    async def test_returns_201(self, client, svc):
        svc.create.return_value = _AUTO
        async with client as c:
            resp = await c.post(
                "/",
                json={
                    "name": "Morning Reset",
                    "trigger": {"type": "schedule", "cron": "0 * * * *"},
                    "action_template_id": "tmpl-01",
                },
            )
        assert resp.status_code == 201
        assert resp.json()["id"] == "auto-01"


class TestGetAutomation:
    async def test_returns_automation(self, client, svc):
        svc.get.return_value = _AUTO
        async with client as c:
            resp = await c.get("/auto-01")
        assert resp.status_code == 200
        assert resp.json()["name"] == "Morning Reset"

    async def test_not_found_returns_404(self, client, svc):
        svc.get.side_effect = NotFoundError("not found")
        async with client as c:
            resp = await c.get("/missing")
        assert resp.status_code == 404


class TestUpdateAutomation:
    async def test_returns_updated(self, client, svc):
        updated = _AUTO.model_copy(update={"name": "Renamed"})
        svc.update.return_value = updated
        async with client as c:
            resp = await c.patch("/auto-01", json={"name": "Renamed"})
        assert resp.status_code == 200
        assert resp.json()["name"] == "Renamed"

    async def test_not_found_returns_404(self, client, svc):
        svc.update.side_effect = NotFoundError("not found")
        async with client as c:
            resp = await c.patch("/missing", json={"name": "x"})
        assert resp.status_code == 404


class TestDeleteAutomation:
    async def test_returns_204(self, client, svc):
        async with client as c:
            resp = await c.delete("/auto-01")
        assert resp.status_code == 204

    async def test_not_found_returns_404(self, client, svc):
        svc.delete.side_effect = NotFoundError("not found")
        async with client as c:
            resp = await c.delete("/missing")
        assert resp.status_code == 404


class TestEnableAutomation:
    async def test_returns_enabled(self, client, svc):
        svc.enable.return_value = _AUTO
        async with client as c:
            resp = await c.post("/auto-01/enable")
        assert resp.status_code == 200
        assert resp.json()["enabled"] is True

    async def test_not_found_returns_404(self, client, svc):
        svc.enable.side_effect = NotFoundError("not found")
        async with client as c:
            resp = await c.post("/missing/enable")
        assert resp.status_code == 404


class TestDisableAutomation:
    async def test_returns_disabled(self, client, svc):
        disabled = _AUTO.model_copy(update={"enabled": False})
        svc.disable.return_value = disabled
        async with client as c:
            resp = await c.post("/auto-01/disable")
        assert resp.status_code == 200
        assert resp.json()["enabled"] is False

    async def test_not_found_returns_404(self, client, svc):
        svc.disable.side_effect = NotFoundError("not found")
        async with client as c:
            resp = await c.post("/missing/disable")
        assert resp.status_code == 404


class TestListExecutions:
    async def test_returns_executions(self, client, svc):
        svc.list_executions.return_value = [_EXECUTION]
        async with client as c:
            resp = await c.get("/auto-01/executions")
        assert resp.status_code == 200
        assert resp.json()[0]["id"] == "exec-01"
        svc.list_executions.assert_awaited_once_with("auto-01")

    async def test_empty(self, client, svc):
        svc.list_executions.return_value = []
        async with client as c:
            resp = await c.get("/auto-01/executions")
        assert resp.status_code == 200
        assert resp.json() == []


class TestListTriggerSchemas:
    async def test_returns_schemas(self, client, svc):
        svc.list_trigger_schemas.return_value = [{"title": "Schedule"}]
        async with client as c:
            resp = await c.get("/triggers")
        assert resp.status_code == 200
        assert resp.json() == [{"title": "Schedule"}]

    async def test_not_shadowed_by_id_route(self, client, svc):
        """Ensure /triggers is not captured as /{automation_id}."""
        svc.list_trigger_schemas.return_value = []
        async with client as c:
            resp = await c.get("/triggers")
        assert resp.status_code == 200
        svc.list_trigger_schemas.assert_called_once()
        svc.get.assert_not_called()
