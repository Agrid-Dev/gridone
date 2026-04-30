from datetime import UTC, datetime
from unittest.mock import AsyncMock

import pytest
from models.types import Severity

from notifications.interface import NotificationsServiceInterface
from notifications.models import Notification, NotificationDispatch

from api.action_providers.notifications import (
    NotificationAction,
    NotificationsActionProvider,
)


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


class TestNotificationsActionProvider:
    def test_provider_id(self):
        svc = _notifications_service()
        provider = NotificationsActionProvider(svc)
        assert provider.id == "notification"

    def test_action_schema(self):
        svc = _notifications_service()
        provider = NotificationsActionProvider(svc)
        assert isinstance(provider.action_schema, dict)
        assert "properties" in provider.action_schema

    @pytest.mark.asyncio
    async def test_execute_calls_dispatch(self):
        svc = _notifications_service()
        provider = NotificationsActionProvider(svc)
        await provider.execute(
            {
                "title": "Hot!",
                "body": "Too hot",
                "severity": Severity.ALERT,
                "user_ids": ["u1"],
            }
        )
        svc.dispatch.assert_awaited_once_with(
            title="Hot!",
            body="Too hot",
            severity=Severity.ALERT,
            user_ids=["u1"],
            created_by="system",
        )

    @pytest.mark.asyncio
    async def test_execute_returns_first_notification_id(self):
        svc = _notifications_service(notif_id="notif-xyz")
        provider = NotificationsActionProvider(svc)
        result = await provider.execute(
            {
                "title": "Hot!",
                "body": "Too hot",
                "severity": Severity.ALERT,
                "user_ids": ["u1"],
            }
        )
        assert result == "notif-xyz"

    @pytest.mark.asyncio
    async def test_execute_returns_empty_when_no_dispatches(self):
        svc = AsyncMock(spec=NotificationsServiceInterface)
        svc.dispatch = AsyncMock(return_value=[])
        provider = NotificationsActionProvider(svc)
        result = await provider.execute(
            {
                "title": "Hot!",
                "body": "Too hot",
                "severity": Severity.ALERT,
                "user_ids": ["u1"],
            }
        )
        assert result is None

    def test_notification_action_json_schema(self):
        schema = NotificationAction.model_json_schema()
        props = schema["properties"]
        assert "title" in props
        assert "body" in props
        assert "severity" in props
        assert "user_ids" in props
