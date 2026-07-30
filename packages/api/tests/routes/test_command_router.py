"""Tests for the command router — template CRUD + saved-template dispatch.

The non-template endpoints (single/batch dispatch, command history) are
already covered by ``test_devices_router.py``; this file focuses on the
template surface the reviewer consolidated here."""

from datetime import UTC, datetime
from unittest.mock import AsyncMock

import pytest
from fastapi import FastAPI
from httpx import ASGITransport, AsyncClient

from api.dependencies import (
    get_commands_service,
    get_current_token_payload,
    get_current_user_id,
    get_target_resolver,
)
from api.exception_handlers import register_exception_handlers
from api.routes.command_router import router
from commands import (
    AttributeWrite,
    BatchCommandDispatch,
    CommandsServiceInterface,
    CommandStatus,
    CommandTemplate,
    UnitCommand,
)
from devices_manager.types import DataType
from models.errors import InvalidError, NotFoundError
from models.pagination import Page, PaginationParams
from models.targets import DevicesFilter, ResolvedTarget, TargetResolver


@pytest.fixture
def mock_commands_service():
    return AsyncMock(spec=CommandsServiceInterface)


@pytest.fixture
def mock_target_resolver():
    resolver = AsyncMock(spec=TargetResolver)
    resolver.resolve.return_value = ResolvedTarget(
        attribute="mode",
        device_ids=["t1", "t2"],
        data_type=DataType.STRING,
        excluded_device_ids=[],
    )
    return resolver


@pytest.fixture
def app(mock_commands_service, mock_target_resolver, admin_token_payload) -> FastAPI:
    app = FastAPI()
    register_exception_handlers(app)
    app.include_router(router)
    app.dependency_overrides[get_commands_service] = lambda: mock_commands_service
    app.dependency_overrides[get_target_resolver] = lambda: mock_target_resolver
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
    target: DevicesFilter | None = None,
) -> CommandTemplate:
    return CommandTemplate(
        id=template_id,
        name=name,
        target=target or DevicesFilter(types=["thermostat"]),
        write=AttributeWrite(attribute="mode", value="auto", data_type=DataType.STRING),
        created_at=datetime(2026, 1, 1, tzinfo=UTC),
        created_by="admin",
    )


def _batch(template_id: str, device_ids: list[str]) -> BatchCommandDispatch:
    now = datetime(2026, 1, 1, tzinfo=UTC)
    return BatchCommandDispatch(
        batch_id="batch00000000001",
        commands=[
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
        ],
    )


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
                "/commands/templates/",
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
        assert body["target"] == {"ids": None, "types": ["thermostat"], "tags": None}
        assert body["write"] == {
            "attribute": "mode",
            "value": "auto",
            "data_type": "str",
        }

        template_create = mock_commands_service.save_template.call_args.args[0]
        assert template_create.name == "Thermostats to auto"
        assert template_create.target == DevicesFilter(types=["thermostat"])
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
                "/commands/templates/",
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
    @pytest.mark.parametrize(
        "bad_key",
        [
            pytest.param({"bogus": "x"}, id="unknown-key"),
            # Retired runtime filters are rejected at the wire, not silently
            # dropped — a target is criteria only (ids/types/tags/asset_id).
            pytest.param({"writable_attribute": "mode"}, id="legacy-writable"),
            pytest.param({"is_faulty": True}, id="legacy-is-faulty"),
        ],
    )
    async def test_unknown_target_key_returns_422(
        self,
        async_client: AsyncClient,
        bad_key: dict,
    ):
        async with async_client as ac:
            response = await ac.post(
                "/commands/templates/",
                json={
                    "name": "T",
                    "target": {"ids": ["d1"], **bad_key},
                    "write": {
                        "attribute": "mode",
                        "value": "auto",
                        "data_type": "str",
                    },
                },
            )
        assert response.status_code == 422

    @pytest.mark.asyncio
    async def test_unwritable_target_returns_422(
        self,
        async_client: AsyncClient,
        mock_target_resolver: AsyncMock,
        mock_commands_service: AsyncMock,
    ):
        mock_target_resolver.resolve.side_effect = InvalidError(
            "No device in the target exposes 'mode' as writable"
        )
        async with async_client as ac:
            response = await ac.post(
                "/commands/templates/",
                json={
                    "name": "T",
                    "target": {"types": ["thermostat"]},
                    "write": {
                        "attribute": "mode",
                        "value": "auto",
                        "data_type": "str",
                    },
                },
            )
        assert response.status_code == 422
        mock_commands_service.save_template.assert_not_awaited()

    @pytest.mark.asyncio
    async def test_data_type_mismatch_returns_422(
        self,
        async_client: AsyncClient,
        mock_commands_service: AsyncMock,
    ):
        # The resolver reports 'str' for this attribute; a client-supplied
        # 'float' would persist a write that can never apply.
        async with async_client as ac:
            response = await ac.post(
                "/commands/templates/",
                json={
                    "name": "T",
                    "target": {"types": ["thermostat"]},
                    "write": {
                        "attribute": "mode",
                        "value": 21.5,
                        "data_type": "float",
                    },
                },
            )
        assert response.status_code == 422
        assert "data_type" in response.json()["detail"]
        mock_commands_service.save_template.assert_not_awaited()


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
            response = await ac.get("/commands/templates/")
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
            response = await ac.get("/commands/templates/abc1234567890def")
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
            response = await ac.get("/commands/templates/nope")
        assert response.status_code == 404


class TestUpdateTemplate:
    @pytest.mark.asyncio
    async def test_partial_patch_passes_only_set_fields_to_service(
        self,
        async_client: AsyncClient,
        mock_commands_service: AsyncMock,
    ):
        mock_commands_service.update_template.return_value = _template(name="Renamed")
        async with async_client as ac:
            response = await ac.patch(
                "/commands/templates/abc1234567890def",
                json={"name": "Renamed"},
            )
        assert response.status_code == 200
        assert response.json()["name"] == "Renamed"

        args = mock_commands_service.update_template.call_args.args
        assert args[0] == "abc1234567890def"
        patch = args[1]
        # Only ``name`` was sent — the domain patch reflects that.
        assert patch.model_fields_set == {"name"}
        assert patch.name == "Renamed"

    @pytest.mark.asyncio
    async def test_explicit_null_name_demotes_to_ephemeral(
        self,
        async_client: AsyncClient,
        mock_commands_service: AsyncMock,
    ):
        # ``null`` is meaningful on PATCH — distinct from omitted — and must
        # land in the patch's ``model_fields_set`` so the service can apply
        # the demotion rather than skip the field.
        mock_commands_service.update_template.return_value = _template(name=None)
        async with async_client as ac:
            response = await ac.patch(
                "/commands/templates/abc1234567890def",
                json={"name": None},
            )
        assert response.status_code == 200
        assert response.json()["name"] is None

        patch = mock_commands_service.update_template.call_args.args[1]
        assert "name" in patch.model_fields_set
        assert patch.name is None

    @pytest.mark.asyncio
    async def test_unknown_template_returns_404(
        self,
        async_client: AsyncClient,
        mock_commands_service: AsyncMock,
    ):
        mock_commands_service.update_template.side_effect = NotFoundError(
            "Template 'nope' not found"
        )
        async with async_client as ac:
            response = await ac.patch(
                "/commands/templates/nope",
                json={"name": "Renamed"},
            )
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
            response = await ac.delete("/commands/templates/abc1234567890def")
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
            response = await ac.delete("/commands/templates/nope")
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
            response = await ac.post("/commands/templates/abc1234567890def/dispatch")
        assert response.status_code == 202
        body = response.json()
        assert body["batch_id"] == "batch00000000001"
        assert [c["device_id"] for c in body["commands"]] == ["d1", "d2"]

        kwargs = mock_commands_service.dispatch_from_template.call_args.kwargs
        assert kwargs["template_id"] == "abc1234567890def"

    @pytest.mark.asyncio
    async def test_empty_resolve_returns_422(
        self,
        async_client: AsyncClient,
        mock_commands_service: AsyncMock,
    ):
        mock_commands_service.dispatch_from_template.return_value = (
            BatchCommandDispatch(batch_id="abc1234567890def", commands=[])
        )
        async with async_client as ac:
            response = await ac.post("/commands/templates/abc1234567890def/dispatch")
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
            response = await ac.post("/commands/templates/nope/dispatch")
        assert response.status_code == 404
