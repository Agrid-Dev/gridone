from datetime import UTC, datetime

import pytest

from models.errors import InvalidError
from models.pagination import PaginationParams
from models.types import Severity
from notifications.models import Notification
from notifications.storage.memory import MemoryNotificationsStorage

pytestmark = pytest.mark.asyncio

_NOW = datetime(2026, 1, 1, tzinfo=UTC)
_USER_A = "user-a"
_USER_B = "user-b"


@pytest.fixture
def storage() -> MemoryNotificationsStorage:
    return MemoryNotificationsStorage()


async def _upsert(  # noqa: PLR0913
    storage: MemoryNotificationsStorage,
    *,
    title: str = "Alert",
    body: str = "Something happened",
    severity: Severity = Severity.ALERT,
    correlation_id: str | None = None,
    created_by: str | None = None,
    created_at: datetime = _NOW,
) -> Notification:
    return await storage.upsert_notification(
        title=title,
        body=body,
        severity=severity,
        correlation_id=correlation_id,
        created_by=created_by,
        created_at=created_at,
    )


class TestUpsertNotification:
    async def test_creates_and_returns_notification(
        self, storage: MemoryNotificationsStorage
    ):
        notif = await _upsert(storage)
        assert notif.id
        assert notif.title == "Alert"
        assert notif.severity == Severity.ALERT

    async def test_correlation_id_returns_existing_on_conflict(
        self, storage: MemoryNotificationsStorage
    ):
        first = await _upsert(storage, correlation_id="corr-1")
        second = await _upsert(storage, correlation_id="corr-1")
        assert first.id == second.id

    async def test_different_content_same_correlation_id_raises(
        self, storage: MemoryNotificationsStorage
    ):
        await _upsert(storage, title="Original", correlation_id="corr-2")
        with pytest.raises(InvalidError):
            await _upsert(storage, title="Different", correlation_id="corr-2")

    async def test_without_correlation_always_creates_new(
        self, storage: MemoryNotificationsStorage
    ):
        first = await _upsert(storage)
        second = await _upsert(storage)
        assert first.id != second.id


class TestDispatchToUsers:
    async def test_round_trip_inserts_dispatches(
        self, storage: MemoryNotificationsStorage
    ):
        notif = await _upsert(storage)
        dispatches = await storage.dispatch_to_users(notif, [_USER_A, _USER_B])
        assert {d.user_id for d in dispatches} == {_USER_A, _USER_B}

    async def test_dedup_skips_users_with_active_dispatch(
        self, storage: MemoryNotificationsStorage
    ):
        notif = await _upsert(storage)
        await storage.dispatch_to_users(notif, [_USER_A])
        second = await storage.dispatch_to_users(notif, [_USER_A, _USER_B])
        assert [d.user_id for d in second] == [_USER_B]

    async def test_empty_user_ids_returns_empty(
        self, storage: MemoryNotificationsStorage
    ):
        notif = await _upsert(storage)
        assert await storage.dispatch_to_users(notif, []) == []

    async def test_redispatch_after_dismiss_creates_new_dispatch(
        self, storage: MemoryNotificationsStorage
    ):
        notif = await _upsert(storage)
        await storage.dispatch_to_users(notif, [_USER_A])
        await storage.dismiss(notif.id, _USER_A)
        redispatched = await storage.dispatch_to_users(notif, [_USER_A])
        assert len(redispatched) == 1
        assert redispatched[0].dismissed_at is None


class TestListForUser:
    async def test_returns_dispatches_for_user(
        self, storage: MemoryNotificationsStorage
    ):
        notif = await _upsert(storage)
        await storage.dispatch_to_users(notif, [_USER_A, _USER_B])
        page = await storage.list_for_user(
            _USER_A, severity=None, dismissed=None, pagination=PaginationParams()
        )
        assert page.total == 1
        assert page.items[0].user_id == _USER_A

    async def test_severity_filter(self, storage: MemoryNotificationsStorage):
        alert = await _upsert(storage, severity=Severity.ALERT)
        warn = await _upsert(storage, severity=Severity.WARNING)
        await storage.dispatch_to_users(alert, [_USER_A])
        await storage.dispatch_to_users(warn, [_USER_A])
        page = await storage.list_for_user(
            _USER_A,
            severity=Severity.WARNING,
            dismissed=None,
            pagination=PaginationParams(),
        )
        assert page.total == 1
        assert page.items[0].notification.severity == Severity.WARNING

    async def test_dismissed_filter(self, storage: MemoryNotificationsStorage):
        notif = await _upsert(storage)
        await storage.dispatch_to_users(notif, [_USER_A])
        await storage.dismiss(notif.id, _USER_A)
        active = await storage.list_for_user(
            _USER_A, severity=None, dismissed=False, pagination=PaginationParams()
        )
        dismissed = await storage.list_for_user(
            _USER_A, severity=None, dismissed=True, pagination=PaginationParams()
        )
        assert active.total == 0
        assert dismissed.total == 1

    async def test_pagination(self, storage: MemoryNotificationsStorage):
        for i in range(3):
            notif = await _upsert(
                storage,
                created_at=datetime(2026, 1, i + 1, tzinfo=UTC),
            )
            await storage.dispatch_to_users(notif, [_USER_A])
        page = await storage.list_for_user(
            _USER_A,
            severity=None,
            dismissed=None,
            pagination=PaginationParams(page=1, size=2),
        )
        assert page.total == 3
        assert len(page.items) == 2

    async def test_orders_by_created_at_desc(self, storage: MemoryNotificationsStorage):
        older = await _upsert(storage, created_at=datetime(2026, 1, 1, tzinfo=UTC))
        newer = await _upsert(storage, created_at=datetime(2026, 1, 2, tzinfo=UTC))
        await storage.dispatch_to_users(older, [_USER_A])
        await storage.dispatch_to_users(newer, [_USER_A])
        page = await storage.list_for_user(
            _USER_A, severity=None, dismissed=None, pagination=PaginationParams()
        )
        assert [d.notification.id for d in page.items] == [newer.id, older.id]


class TestDismiss:
    async def test_sets_dismissed_at(self, storage: MemoryNotificationsStorage):
        notif = await _upsert(storage)
        await storage.dispatch_to_users(notif, [_USER_A])
        result = await storage.dismiss(notif.id, _USER_A)
        assert result is not None
        assert result.dismissed_at is not None

    async def test_idempotent_already_dismissed(
        self, storage: MemoryNotificationsStorage
    ):
        notif = await _upsert(storage)
        await storage.dispatch_to_users(notif, [_USER_A])
        first = await storage.dismiss(notif.id, _USER_A)
        second = await storage.dismiss(notif.id, _USER_A)
        assert second is not None
        assert second.dismissed_at == first.dismissed_at  # type: ignore[union-attr]

    async def test_not_dispatched_to_user_returns_none(
        self, storage: MemoryNotificationsStorage
    ):
        notif = await _upsert(storage)
        await storage.dispatch_to_users(notif, [_USER_A])
        assert await storage.dismiss(notif.id, _USER_B) is None

    async def test_unknown_notification_returns_none(
        self, storage: MemoryNotificationsStorage
    ):
        assert await storage.dismiss("nonexistent0001", _USER_A) is None
