import os
from datetime import UTC, datetime
from typing import TYPE_CHECKING

import pytest
import pytest_asyncio

from models.errors import InvalidError
from models.pagination import PaginationParams
from models.types import Severity
from notifications.storage.factory import build_notifications_storage
from notifications.storage.postgres import PostgresNotificationsStorage

if TYPE_CHECKING:
    from notifications.models import Notification

POSTGRES_URL = os.environ.get("POSTGRES_TEST_URL")

pytestmark = [
    pytest.mark.asyncio,
    pytest.mark.integration,
    pytest.mark.skipif(POSTGRES_URL is None, reason="POSTGRES_TEST_URL not set"),
]

_NOW = datetime(2026, 1, 1, tzinfo=UTC)
_USER_A = "user-a"
_USER_B = "user-b"


@pytest_asyncio.fixture
async def storage():
    """Real storage against POSTGRES_TEST_URL.

    Each test starts with empty tables.
    """
    assert POSTGRES_URL is not None
    store: PostgresNotificationsStorage = (  # type: ignore[assignment]
        await build_notifications_storage(POSTGRES_URL)
    )
    async with store.pool.acquire() as conn:
        await conn.execute("DELETE FROM notification_dispatches")
        await conn.execute("DELETE FROM notifications")

    yield store

    await store.close()


async def _upsert(  # noqa: PLR0913
    storage: PostgresNotificationsStorage,
    *,
    title: str = "Alert",
    body: str = "Something happened",
    severity: Severity = Severity.ALERT,
    correlation_id: str | None = None,
    created_by: str | None = None,
) -> "Notification":
    return await storage.upsert_notification(
        title=title,
        body=body,
        severity=severity,
        correlation_id=correlation_id,
        created_by=created_by,
        created_at=_NOW,
    )


class TestUpsertNotification:
    async def test_creates_and_returns_notification(self, storage):
        notif = await _upsert(storage)
        assert notif.id is not None
        assert notif.title == "Alert"
        assert notif.severity == Severity.ALERT
        assert notif.correlation_id is None

    async def test_correlation_id_returns_existing_on_conflict(self, storage):
        first = await _upsert(storage, correlation_id="corr-1")
        second = await _upsert(storage, correlation_id="corr-1")
        assert first.id == second.id

    async def test_different_content_same_correlation_id_raises(self, storage):
        await _upsert(storage, title="Original", correlation_id="corr-2")
        with pytest.raises(InvalidError):
            await _upsert(storage, title="Different", correlation_id="corr-2")

    async def test_without_correlation_always_creates_new(self, storage):
        first = await _upsert(storage)
        second = await _upsert(storage)
        assert first.id != second.id


class TestDispatchToUsers:
    async def test_round_trip_inserts_dispatches(self, storage):
        notif = await _upsert(storage)
        dispatches = await storage.dispatch_to_users(notif, [_USER_A, _USER_B])
        assert len(dispatches) == 2
        user_ids = {d.user_id for d in dispatches}
        assert user_ids == {_USER_A, _USER_B}

    async def test_dedup_skips_users_with_active_dispatch(self, storage):
        notif = await _upsert(storage)
        await storage.dispatch_to_users(notif, [_USER_A])
        second = await storage.dispatch_to_users(notif, [_USER_A, _USER_B])
        assert len(second) == 1
        assert second[0].user_id == _USER_B

    async def test_empty_user_ids_returns_empty(self, storage):
        notif = await _upsert(storage)
        result = await storage.dispatch_to_users(notif, [])
        assert result == []

    async def test_redispatch_after_dismiss_creates_new_dispatch(self, storage):
        notif = await _upsert(storage)
        await storage.dispatch_to_users(notif, [_USER_A])
        await storage.dismiss(notif.id, _USER_A)
        redispatched = await storage.dispatch_to_users(notif, [_USER_A])
        assert len(redispatched) == 1


class TestListForUser:
    async def test_returns_dispatches_for_user(self, storage):
        notif = await _upsert(storage)
        await storage.dispatch_to_users(notif, [_USER_A, _USER_B])
        page = await storage.list_for_user(
            _USER_A, severity=None, dismissed=None, pagination=PaginationParams()
        )
        assert page.total == 1
        assert page.items[0].user_id == _USER_A

    async def test_severity_filter(self, storage):
        notif_alert = await _upsert(storage, severity=Severity.ALERT)
        notif_warn = await _upsert(storage, severity=Severity.WARNING)
        await storage.dispatch_to_users(notif_alert, [_USER_A])
        await storage.dispatch_to_users(notif_warn, [_USER_A])
        page = await storage.list_for_user(
            _USER_A,
            severity=Severity.WARNING,
            dismissed=None,
            pagination=PaginationParams(),
        )
        assert page.total == 1
        assert page.items[0].notification.severity == Severity.WARNING

    async def test_dismissed_filter(self, storage):
        notif = await _upsert(storage)
        await storage.dispatch_to_users(notif, [_USER_A])
        await storage.dismiss(notif.id, _USER_A)
        active_page = await storage.list_for_user(
            _USER_A, severity=None, dismissed=False, pagination=PaginationParams()
        )
        dismissed_page = await storage.list_for_user(
            _USER_A, severity=None, dismissed=True, pagination=PaginationParams()
        )
        assert active_page.total == 0
        assert dismissed_page.total == 1

    async def test_pagination(self, storage):
        for _ in range(3):
            notif = await _upsert(storage)
            await storage.dispatch_to_users(notif, [_USER_A])
        page = await storage.list_for_user(
            _USER_A,
            severity=None,
            dismissed=None,
            pagination=PaginationParams(page=1, size=2),
        )
        assert page.total == 3
        assert len(page.items) == 2


class TestDismiss:
    async def test_sets_dismissed_at(self, storage):
        notif = await _upsert(storage)
        await storage.dispatch_to_users(notif, [_USER_A])
        result = await storage.dismiss(notif.id, _USER_A)
        assert result is not None
        assert result.dismissed_at is not None

    async def test_idempotent_already_dismissed(self, storage):
        notif = await _upsert(storage)
        await storage.dispatch_to_users(notif, [_USER_A])
        first = await storage.dismiss(notif.id, _USER_A)
        second = await storage.dismiss(notif.id, _USER_A)
        assert second is not None
        assert second.dismissed_at == first.dismissed_at

    async def test_not_dispatched_to_user_returns_none(self, storage):
        notif = await _upsert(storage)
        await storage.dispatch_to_users(notif, [_USER_A])
        result = await storage.dismiss(notif.id, _USER_B)
        assert result is None

    async def test_unknown_notification_returns_none(self, storage):
        result = await storage.dismiss("nonexistent0001", _USER_A)
        assert result is None
