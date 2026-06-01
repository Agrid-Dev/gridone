from datetime import UTC, datetime
from unittest.mock import AsyncMock

import pytest

from api.action_providers.notifications import NotificationsActionProvider
from models.types import Severity
from notifications.interface import NotificationsServiceInterface
from notifications.models import Notification, NotificationDispatch


def _dispatch(notif_id: str = "notif-abc") -> NotificationDispatch:
    notification = Notification(
        id=notif_id,
        title="Hot!",
        body="Too hot",
        severity=Severity.ALERT,
        correlation_id=None,
        created_by="system",
        created_at=datetime(2026, 1, 1, tzinfo=UTC),
    )
    return NotificationDispatch(
        notification=notification,
        user_id="u1",
        dispatched_at=datetime(2026, 1, 1, tzinfo=UTC),
        dismissed_at=None,
    )


def _notifications_service(notif_id: str = "notif-abc") -> AsyncMock:
    svc = AsyncMock(spec=NotificationsServiceInterface)
    svc.dispatch = AsyncMock(return_value=[_dispatch(notif_id)])
    return svc


_PARAMS = {
    "title": "Hot!",
    "body": "Too hot",
    "severity": Severity.ALERT,
    "user_ids": ["u1"],
}


class TestNotificationsActionProvider:
    def test_has_params_schema(self):
        provider = NotificationsActionProvider(_notifications_service())
        assert "properties" in provider.params_schema

    @pytest.mark.asyncio
    async def test_execute_dispatches_and_returns_notification_id(self):
        svc = _notifications_service(notif_id="notif-xyz")
        provider = NotificationsActionProvider(svc)
        result = await provider.execute(_PARAMS)
        svc.dispatch.assert_awaited_once_with(
            title="Hot!",
            body="Too hot",
            severity=Severity.ALERT,
            user_ids=["u1"],
            created_by="system",
        )
        assert result == "notif-xyz"

    @pytest.mark.asyncio
    async def test_execute_returns_none_when_no_dispatches(self):
        svc = AsyncMock(spec=NotificationsServiceInterface)
        svc.dispatch = AsyncMock(return_value=[])
        provider = NotificationsActionProvider(svc)
        assert await provider.execute(_PARAMS) is None
