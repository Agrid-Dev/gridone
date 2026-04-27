from datetime import UTC, datetime
from unittest.mock import AsyncMock, patch

import pytest

from models.errors import InvalidError, NotFoundError
from models.pagination import Page, PaginationParams
from models.types import Severity
from notifications.models import Notification, NotificationDispatch
from notifications.notifications_service import NotificationsService
from notifications.storage.protocol import NotificationsStorageBackend

pytestmark = pytest.mark.asyncio

_USER_A = "user-a"
_USER_B = "user-b"
_NOTIF_ID = "notif0000000001"
_NOW = datetime.now(UTC)

_NOTIFICATION = Notification(
    id=_NOTIF_ID,
    title="Alert",
    body="Something happened",
    severity=Severity.ALERT,
    correlation_id=None,
    created_by=None,
    created_at=_NOW,
)


def _make_dispatch(
    user_id: str = _USER_A, *, dismissed: bool = False
) -> NotificationDispatch:
    return NotificationDispatch(
        notification=_NOTIFICATION,
        user_id=user_id,
        dispatched_at=_NOW,
        dismissed_at=_NOW if dismissed else None,
    )


@pytest.fixture
def storage() -> AsyncMock:
    return AsyncMock(spec=NotificationsStorageBackend)


@pytest.fixture
def service(storage: AsyncMock) -> NotificationsService:
    svc = NotificationsService("postgresql://test")
    svc._storage = storage
    return svc


class TestClose:
    async def test_delegates_to_storage(
        self,
        service: NotificationsService,
        storage: AsyncMock,
    ) -> None:
        await service.close()
        storage.close.assert_awaited_once()


class TestStart:
    async def test_builds_storage_from_url(self) -> None:
        mock_storage = AsyncMock(spec=NotificationsStorageBackend)
        with patch(
            "notifications.notifications_service.build_notifications_storage",
            return_value=mock_storage,
        ):
            svc = NotificationsService("postgresql://test")
            await svc.start()
        assert svc._storage is mock_storage


class TestDispatch:
    async def test_upserts_notification_and_dispatches(
        self,
        service: NotificationsService,
        storage: AsyncMock,
    ) -> None:
        storage.upsert_notification.return_value = _NOTIFICATION
        storage.dispatch_to_users.return_value = [_make_dispatch(_USER_A)]
        result = await service.dispatch(
            title="Alert",
            body="Something happened",
            severity=Severity.ALERT,
            user_ids=[_USER_A],
        )
        storage.upsert_notification.assert_awaited_once()
        storage.dispatch_to_users.assert_awaited_once_with(_NOTIFICATION, [_USER_A])
        assert len(result) == 1

    async def test_dispatch_returns_list_of_dispatches(
        self,
        service: NotificationsService,
        storage: AsyncMock,
    ) -> None:
        storage.upsert_notification.return_value = _NOTIFICATION
        expected = [_make_dispatch(_USER_A), _make_dispatch(_USER_B)]
        storage.dispatch_to_users.return_value = expected
        result = await service.dispatch(
            title="Alert",
            body="Something happened",
            severity=Severity.ALERT,
            user_ids=[_USER_A, _USER_B],
        )
        assert result == expected

    async def test_empty_when_all_already_dispatched(
        self,
        service: NotificationsService,
        storage: AsyncMock,
    ) -> None:
        storage.upsert_notification.return_value = _NOTIFICATION
        storage.dispatch_to_users.return_value = []
        result = await service.dispatch(
            title="Alert",
            body="Something happened",
            severity=Severity.ALERT,
            user_ids=[_USER_A],
        )
        assert result == []

    async def test_invalid_error_propagates_on_content_conflict(
        self,
        service: NotificationsService,
        storage: AsyncMock,
    ) -> None:
        storage.upsert_notification.side_effect = InvalidError("content mismatch")
        with pytest.raises(InvalidError):
            await service.dispatch(
                title="Different title",
                body="Something happened",
                severity=Severity.ALERT,
                user_ids=[_USER_A],
                correlation_id="corr-1",
            )

    async def test_created_by_forwarded_to_storage(
        self,
        service: NotificationsService,
        storage: AsyncMock,
    ) -> None:
        storage.upsert_notification.return_value = _NOTIFICATION
        storage.dispatch_to_users.return_value = []
        await service.dispatch(
            title="Alert",
            body="Something happened",
            severity=Severity.ALERT,
            user_ids=[_USER_A],
            created_by=_USER_B,
        )
        assert storage.upsert_notification.call_args.kwargs["created_by"] == _USER_B

    async def test_correlation_id_forwarded_to_storage(
        self,
        service: NotificationsService,
        storage: AsyncMock,
    ) -> None:
        storage.upsert_notification.return_value = _NOTIFICATION
        storage.dispatch_to_users.return_value = []
        await service.dispatch(
            title="Alert",
            body="Something happened",
            severity=Severity.ALERT,
            user_ids=[_USER_A],
            correlation_id="corr-1",
        )
        kwargs = storage.upsert_notification.call_args.kwargs
        assert kwargs["correlation_id"] == "corr-1"


class TestListForUser:
    async def test_delegates_to_storage_with_defaults(
        self,
        service: NotificationsService,
        storage: AsyncMock,
    ) -> None:
        expected = Page(items=[], total=0, page=1, size=50)
        storage.list_for_user.return_value = expected
        result = await service.list_for_user(_USER_A)
        storage.list_for_user.assert_awaited_once_with(
            _USER_A,
            severity=None,
            dismissed=None,
            pagination=PaginationParams(),
        )
        assert result is expected

    async def test_passes_filters_to_storage(
        self,
        service: NotificationsService,
        storage: AsyncMock,
    ) -> None:
        storage.list_for_user.return_value = Page(items=[], total=0, page=2, size=10)
        pagination = PaginationParams(page=2, size=10)
        await service.list_for_user(
            _USER_A,
            severity=Severity.WARNING,
            dismissed=False,
            pagination=pagination,
        )
        storage.list_for_user.assert_awaited_once_with(
            _USER_A,
            severity=Severity.WARNING,
            dismissed=False,
            pagination=pagination,
        )


class TestDismiss:
    async def test_returns_dispatch_on_success(
        self,
        service: NotificationsService,
        storage: AsyncMock,
    ) -> None:
        expected = _make_dispatch(dismissed=True)
        storage.dismiss.return_value = expected
        result = await service.dismiss(_NOTIF_ID, _USER_A)
        storage.dismiss.assert_awaited_once_with(_NOTIF_ID, _USER_A)
        assert result is expected

    async def test_idempotent_already_dismissed(
        self,
        service: NotificationsService,
        storage: AsyncMock,
    ) -> None:
        already_dismissed = _make_dispatch(dismissed=True)
        storage.dismiss.return_value = already_dismissed
        result = await service.dismiss(_NOTIF_ID, _USER_A)
        assert result.dismissed_at is not None

    async def test_not_found_raises_not_found_error(
        self,
        service: NotificationsService,
        storage: AsyncMock,
    ) -> None:
        storage.dismiss.return_value = None
        with pytest.raises(NotFoundError):
            await service.dismiss(_NOTIF_ID, _USER_A)
