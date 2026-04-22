"""Tests for the command router — template CRUD + saved-template dispatch.

The non-template endpoints (single/batch dispatch, command history) are
already covered by ``test_devices_router.py``; this file focuses on the
template surface the reviewer consolidated here."""

from datetime import UTC, datetime
from unittest.mock import AsyncMock

import pytest
from commands import (
    AttributeWrite,
    CommandsServiceInterface,
    CommandStatus,
    CommandTemplate,
    UnitCommand,
)
from devices_manager.types import DataType
from fastapi import FastAPI
from httpx import ASGITransport, AsyncClient
from models.errors import NotFoundError
from models.pagination import Page, PaginationParams

from api.dependencies import (
    get_commands_service,
    get_current_token_payload,
    get_current_user_id,
)
from api.exception_handlers import register_exception_handlers
from api.routes.command_router import router


@pytest.fixture
def mock_commands_service():
    return AsyncMock(spec=CommandsServiceInterface)


@pytest.fixture
def app(mock_commands_service, admin_token_payload) -> FastAPI:
    app = FastAPI()
    register_exception_handlers(app)
    app.include_router(router)
    app.dependency_overrides[get_commands_service] = lambda: mock_commands_service
    app.dependency_overrides[get_current_token_payload] = lambda: admin_token_payload
    app.dependency_overrides[get_current_user_id] = lambda: admin_token_payload.sub
    return app


@pytest.fixture
def async_client(app):
    return AsyncClient(transport=ASGITransport(app=app), base_url="http://test")


def _template(
    *,
    template_id: str = "abc1234567890def",
    name: str | None = "Thermostats to auto",
    target: dict | None = None,
) -> CommandTemplate:
    return CommandTemplate(
        id=template_id,
        name=name,
        target=target or {"types": ["thermostat"]},
        write=AttributeWrite(attribute="mode", value="auto", data_type=DataType.STRING),
        created_at=datetime(2026, 1, 1, tzinfo=UTC),
        created_by="admin",
    )


def _batch(template_id: str, device_ids: list[str]) -> list[UnitCommand]:
    now = datetime(2026, 1, 1, tzinfo=UTC)
    return [
        UnitCommand(
            id=i,
            batch_id="batch00000000001",
            template_id=template_id,
            device_id=device_id,
            attribute="mode",
            value="auto",
            data_type=DataType.STRING,
            status=CommandStatus.PENDING,
            status_details=None,
            user_id="test-user",
            created_at=now,
            executed_at=now,
            completed_at=None,
        )
        for i, device_id in enumerate(device_ids, start=1)
    ]


class TestCreateTemplate:
    @pytest.mark.asyncio
    async def test_creates_named_template(
        self,
        async_client: AsyncClient,
        mock_commands_service: AsyncMock,
    ):
        saved = _template(name="Thermostats to auto")
        mock_commands_service.save_template.return_value = saved

        async with async_client as ac:
            response = await ac.post(
                "/command-templates/",
                json={
                    "name": "Thermostats to auto",
                    "target": {"types": ["thermostat"]},
                    "write": {
                        "attribute": "mode",
                        "value": "auto",
                        "data_type": "str",
                    },
                },
            )
        assert response.status_code == 201
        body = response.json()
        assert body["id"] == saved.id
        assert body["name"] == "Thermostats to auto"
        assert body["target"] == {"types": ["thermostat"]}
        assert body["write"] == {
            "attribute": "mode",
            "value": "auto",
            "data_type": "str",
        }

        template_create = mock_commands_service.save_template.call_args.args[0]
        assert template_create.name == "Thermostats to auto"
        assert template_create.target == {"types": ["thermostat"]}
        assert template_create.write.data_type == DataType.STRING

    @pytest.mark.asyncio
    async def test_creates_ephemeral_without_name(
        self,
        async_client: AsyncClient,
        mock_commands_service: AsyncMock,
    ):
        mock_commands_service.save_template.return_value = _template(name=None)
        async with async_client as ac:
            response = await ac.post(
                "/command-templates/",
                json={
                    "target": {"ids": ["d1"]},
                    "write": {
                        "attribute": "mode",
                        "value": "auto",
                        "data_type": "str",
                    },
                },
            )
        assert response.status_code == 201
        assert response.json()["name"] is None

    @pytest.mark.asyncio
    async def test_unknown_target_key_returns_422(
        self,
        async_client: AsyncClient,
    ):
        async with async_client as ac:
            response = await ac.post(
                "/command-templates/",
                json={
                    "name": "T",
                    "target": {"ids": ["d1"], "bogus": "x"},
                    "write": {
                        "attribute": "mode",
                        "value": "auto",
                        "data_type": "str",
                    },
                },
            )
        assert response.status_code == 422


class TestListTemplates:
    @pytest.mark.asyncio
    async def test_returns_paginated_named_templates(
        self,
        async_client: AsyncClient,
        mock_commands_service: AsyncMock,
    ):
        mock_commands_service.list_templates.return_value = Page(
            items=[
                _template(name="one"),
                _template(template_id="def1234567890abc", name="two"),
            ],
            total=2,
            page=1,
            size=50,
        )
        async with async_client as ac:
            response = await ac.get("/command-templates/")
        assert response.status_code == 200
        body = response.json()
        assert body["total"] == 2
        assert [t["name"] for t in body["items"]] == ["one", "two"]

        kwargs = mock_commands_service.list_templates.call_args.kwargs
        assert kwargs["pagination"] == PaginationParams(page=1, size=50)


class TestGetTemplate:
    @pytest.mark.asyncio
    async def test_returns_template_by_id(
        self,
        async_client: AsyncClient,
        mock_commands_service: AsyncMock,
    ):
        mock_commands_service.get_template.return_value = _template()
        async with async_client as ac:
            response = await ac.get("/command-templates/abc1234567890def")
        assert response.status_code == 200
        assert response.json()["id"] == "abc1234567890def"

    @pytest.mark.asyncio
    async def test_unknown_template_returns_404(
        self,
        async_client: AsyncClient,
        mock_commands_service: AsyncMock,
    ):
        mock_commands_service.get_template.side_effect = NotFoundError(
            "Template 'nope' not found"
        )
        async with async_client as ac:
            response = await ac.get("/command-templates/nope")
        assert response.status_code == 404


class TestDeleteTemplate:
    @pytest.mark.asyncio
    async def test_returns_204_on_success(
        self,
        async_client: AsyncClient,
        mock_commands_service: AsyncMock,
    ):
        mock_commands_service.delete_template.return_value = None
        async with async_client as ac:
            response = await ac.delete("/command-templates/abc1234567890def")
        assert response.status_code == 204

    @pytest.mark.asyncio
    async def test_unknown_template_returns_404(
        self,
        async_client: AsyncClient,
        mock_commands_service: AsyncMock,
    ):
        mock_commands_service.delete_template.side_effect = NotFoundError(
            "Template 'nope' not found"
        )
        async with async_client as ac:
            response = await ac.delete("/command-templates/nope")
        assert response.status_code == 404


class TestDispatchTemplate:
    @pytest.mark.asyncio
    async def test_returns_202_with_batch_id(
        self,
        async_client: AsyncClient,
        mock_commands_service: AsyncMock,
    ):
        mock_commands_service.dispatch_from_template.return_value = _batch(
            "abc1234567890def", ["d1", "d2"]
        )
        async with async_client as ac:
            response = await ac.post("/command-templates/abc1234567890def/dispatch")
        assert response.status_code == 202
        assert response.json() == {"batch_id": "batch00000000001", "total": 2}

        kwargs = mock_commands_service.dispatch_from_template.call_args.kwargs
        assert kwargs["template_id"] == "abc1234567890def"

    @pytest.mark.asyncio
    async def test_empty_resolve_returns_422(
        self,
        async_client: AsyncClient,
        mock_commands_service: AsyncMock,
    ):
        mock_commands_service.dispatch_from_template.return_value = []
        async with async_client as ac:
            response = await ac.post("/command-templates/abc1234567890def/dispatch")
        assert response.status_code == 422

    @pytest.mark.asyncio
    async def test_unknown_template_returns_404(
        self,
        async_client: AsyncClient,
        mock_commands_service: AsyncMock,
    ):
        mock_commands_service.dispatch_from_template.side_effect = NotFoundError(
            "Template 'nope' not found"
        )
        async with async_client as ac:
            response = await ac.post("/command-templates/nope/dispatch")
        assert response.status_code == 404
