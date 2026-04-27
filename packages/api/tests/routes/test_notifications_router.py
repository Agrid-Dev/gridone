from datetime import UTC, datetime, timedelta
from unittest.mock import AsyncMock

import pytest
from fastapi import FastAPI
from httpx import ASGITransport, AsyncClient
from models.errors import NotFoundError
from models.pagination import Page, PaginationParams
from models.types import Severity
from notifications import (
    Notification,
    NotificationDispatch,
    NotificationsServiceInterface,
)
from users.auth import TokenPayload

from api.dependencies import (
    get_current_token_payload,
    get_current_user_id,
    get_notifications_service,
)
from api.exception_handlers import register_exception_handlers
from api.routes.notifications_router import router

pytestmark = pytest.mark.asyncio

_USER_ID = "test-user"
_NOTIF_ID = "notif0000000001"
_NOW = datetime(2026, 1, 1, tzinfo=UTC)

_NOTIF = Notification(
    id=_NOTIF_ID,
    title="Alert",
    body="Something happened",
    severity=Severity.ALERT,
    correlation_id=None,
    created_by=None,
    created_at=_NOW,
)
_DISPATCH = NotificationDispatch(
    notification=_NOTIF,
    user_id=_USER_ID,
    dispatched_at=_NOW,
    dismissed_at=None,
)
_DISMISSED_DISPATCH = NotificationDispatch(
    notification=_NOTIF,
    user_id=_USER_ID,
    dispatched_at=_NOW,
    dismissed_at=_NOW,
)
_EMPTY_PAGE: Page[NotificationDispatch] = Page(items=[], total=0, page=1, size=50)

_VIEWER_PAYLOAD = TokenPayload(
    sub=_USER_ID,
    role="viewer",
    exp=datetime.now(UTC) + timedelta(hours=1),
)


@pytest.fixture
def svc() -> AsyncMock:
    return AsyncMock(spec=NotificationsServiceInterface)


@pytest.fixture
def app(svc, admin_token_payload) -> FastAPI:
    app = FastAPI()
    register_exception_handlers(app)
    app.include_router(router)
    app.dependency_overrides[get_notifications_service] = lambda: svc
    app.dependency_overrides[get_current_token_payload] = lambda: admin_token_payload
    app.dependency_overrides[get_current_user_id] = lambda: _USER_ID
    return app


@pytest.fixture
def client(app: FastAPI) -> AsyncClient:
    return AsyncClient(transport=ASGITransport(app=app), base_url="http://test")


class TestListNotifications:
    async def test_returns_paginated_notifications(self, client, svc):
        svc.list_for_user.return_value = Page(
            items=[_DISPATCH], total=1, page=1, size=50
        )
        async with client as c:
            resp = await c.get("/")
        assert resp.status_code == 200
        data = resp.json()
        assert data["total"] == 1
        assert data["items"][0]["notification"]["id"] == _NOTIF_ID

    async def test_passes_user_id_from_jwt(self, client, svc):
        svc.list_for_user.return_value = _EMPTY_PAGE
        async with client as c:
            await c.get("/")
        assert svc.list_for_user.call_args.args[0] == _USER_ID

    async def test_severity_filter_passed_through(self, client, svc):
        svc.list_for_user.return_value = _EMPTY_PAGE
        async with client as c:
            await c.get("/?severity=alert")
        assert svc.list_for_user.call_args.kwargs["severity"] == Severity.ALERT

    async def test_no_severity_filter_passes_none(self, client, svc):
        svc.list_for_user.return_value = _EMPTY_PAGE
        async with client as c:
            await c.get("/")
        assert svc.list_for_user.call_args.kwargs["severity"] is None

    async def test_dismissed_filter_passed_through(self, client, svc):
        svc.list_for_user.return_value = _EMPTY_PAGE
        async with client as c:
            await c.get("/?dismissed=false")
        assert svc.list_for_user.call_args.kwargs["dismissed"] is False

    async def test_no_dismissed_filter_passes_none(self, client, svc):
        svc.list_for_user.return_value = _EMPTY_PAGE
        async with client as c:
            await c.get("/")
        assert svc.list_for_user.call_args.kwargs["dismissed"] is None

    async def test_pagination_params_forwarded(self, client, svc):
        svc.list_for_user.return_value = Page(items=[], total=0, page=2, size=10)
        async with client as c:
            await c.get("/?page=2&size=10")
        assert svc.list_for_user.call_args.kwargs["pagination"] == PaginationParams(
            page=2, size=10
        )

    async def test_returns_pagination_links(self, client, svc):
        """Response includes pagination metadata."""
        svc.list_for_user.return_value = _EMPTY_PAGE
        async with client as c:
            resp = await c.get("/")
        data = resp.json()
        assert "links" in data
        assert "total_pages" in data


class TestDismissNotification:
    async def test_dismiss_returns_200(self, client, svc):
        svc.dismiss.return_value = _DISMISSED_DISPATCH
        async with client as c:
            resp = await c.post(f"/{_NOTIF_ID}/dismiss")
        assert resp.status_code == 200
        assert resp.json()["dismissed_at"] is not None

    async def test_dismiss_passes_user_id_from_jwt(self, client, svc):
        svc.dismiss.return_value = _DISPATCH
        async with client as c:
            await c.post(f"/{_NOTIF_ID}/dismiss")
        svc.dismiss.assert_awaited_once_with(_NOTIF_ID, _USER_ID)

    async def test_notification_not_found_returns_404(self, client, svc):
        svc.dismiss.side_effect = NotFoundError("not found")
        async with client as c:
            resp = await c.post("/nonexistent/dismiss")
        assert resp.status_code == 404

    async def test_user_not_recipient_returns_404(self, client, svc):
        svc.dismiss.side_effect = NotFoundError("not a recipient")
        async with client as c:
            resp = await c.post(f"/{_NOTIF_ID}/dismiss")
        assert resp.status_code == 404

    async def test_already_dismissed_returns_200(self, client, svc):
        """Dismiss is idempotent — already dismissed still returns 200."""
        svc.dismiss.return_value = _DISMISSED_DISPATCH
        async with client as c:
            resp = await c.post(f"/{_NOTIF_ID}/dismiss")
        assert resp.status_code == 200
        assert resp.json()["dismissed_at"] is not None


class TestDispatchNotification:
    _PAYLOAD = {
        "title": "Alert",
        "body": "Something happened",
        "severity": "alert",
        "user_ids": [_USER_ID],
    }

    async def test_returns_201(self, client, svc):
        svc.dispatch.return_value = [_DISPATCH]
        async with client as c:
            resp = await c.post("/", json=self._PAYLOAD)
        assert resp.status_code == 201
        assert resp.json()[0]["notification"]["id"] == _NOTIF_ID

    async def test_forwards_all_fields_to_service(
        self, client, svc, admin_token_payload
    ):
        """All fields including optional correlation_id and created_by are forwarded."""
        svc.dispatch.return_value = [_DISPATCH]
        payload = {**self._PAYLOAD, "correlation_id": "corr-1"}
        async with client as c:
            await c.post("/", json=payload)
        svc.dispatch.assert_awaited_once_with(
            title="Alert",
            body="Something happened",
            severity=Severity.ALERT,
            user_ids=[_USER_ID],
            correlation_id="corr-1",
            created_by=admin_token_payload.sub,
        )

    async def test_created_by_set_from_jwt(self, client, svc, admin_token_payload):
        """created_by is injected from the caller's JWT, not the request body."""
        svc.dispatch.return_value = [_DISPATCH]
        async with client as c:
            await c.post("/", json=self._PAYLOAD)
        assert svc.dispatch.call_args.kwargs["created_by"] == admin_token_payload.sub

    async def test_empty_user_ids_returns_422(self, client, svc):
        """user_ids must be non-empty."""
        async with client as c:
            resp = await c.post(
                "/",
                json={
                    "title": "Alert",
                    "body": "Something happened",
                    "severity": "alert",
                    "user_ids": [],
                },
            )
        assert resp.status_code == 422

    async def test_viewer_forbidden(self, app, svc):
        """Viewer role does not have NOTIFICATIONS_WRITE — returns 403."""
        app.dependency_overrides[get_current_token_payload] = lambda: _VIEWER_PAYLOAD
        async with AsyncClient(
            transport=ASGITransport(app=app), base_url="http://test"
        ) as c:
            resp = await c.post("/", json=self._PAYLOAD)
        assert resp.status_code == 403
