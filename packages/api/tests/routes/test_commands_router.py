from datetime import UTC, datetime
from unittest.mock import AsyncMock

import pytest
from commands import CommandsServiceInterface
from fastapi import FastAPI
from httpx import ASGITransport, AsyncClient
from models.pagination import Page, PaginationParams
from models.types import SortOrder

from api.dependencies import (
    get_commands_service,
    get_current_token_payload,
    get_current_user_id,
)
from api.exception_handlers import register_exception_handlers
from api.routes.commands_router import router


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


def _empty_page() -> Page:
    return Page(items=[], total=0, page=1, size=50)


class TestListCommands:
    @pytest.mark.asyncio
    async def test_no_filters(
        self, async_client: AsyncClient, mock_commands_service: AsyncMock
    ):
        mock_commands_service.get_commands.return_value = _empty_page()
        async with async_client as ac:
            response = await ac.get("/")
        assert response.status_code == 200
        mock_commands_service.get_commands.assert_called_once_with(
            ids=None,
            group_id=None,
            device_id=None,
            attribute=None,
            user_id=None,
            start=None,
            end=None,
            sort=SortOrder.ASC,
            pagination=PaginationParams(page=1, size=50),
        )

    @pytest.mark.asyncio
    async def test_with_full_filters(
        self, async_client: AsyncClient, mock_commands_service: AsyncMock
    ):
        mock_commands_service.get_commands.return_value = _empty_page()
        start = datetime(2026, 1, 1, tzinfo=UTC)
        end = datetime(2026, 1, 31, tzinfo=UTC)
        async with async_client as ac:
            response = await ac.get(
                "/",
                params={
                    "group_id": "abc1234567890def",
                    "device_id": "dev-1",
                    "attribute": "temperature",
                    "user_id": "user-42",
                    "start": start.isoformat(),
                    "end": end.isoformat(),
                    "sort": "desc",
                },
            )
        assert response.status_code == 200
        mock_commands_service.get_commands.assert_called_once_with(
            ids=None,
            group_id="abc1234567890def",
            device_id="dev-1",
            attribute="temperature",
            user_id="user-42",
            start=start,
            end=end,
            sort=SortOrder.DESC,
            pagination=PaginationParams(page=1, size=50),
        )

    @pytest.mark.asyncio
    async def test_pagination_passed_through(
        self, async_client: AsyncClient, mock_commands_service: AsyncMock
    ):
        mock_commands_service.get_commands.return_value = Page(
            items=[], total=0, page=2, size=10
        )
        async with async_client as ac:
            response = await ac.get("/", params={"page": 2, "size": 10})
        assert response.status_code == 200
        kwargs = mock_commands_service.get_commands.call_args.kwargs
        assert kwargs["pagination"] == PaginationParams(page=2, size=10)
