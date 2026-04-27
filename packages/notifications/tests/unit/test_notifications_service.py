from datetime import UTC, datetime
from unittest.mock import AsyncMock, patch

import pytest

from models.errors import NotFoundError
from models.pagination import Page, PaginationParams
from models.types import Severity
from notifications.models import Notification, NotificationForUser
from notifications.notifications_service import NotificationsService
from notifications.storage.protocol import NotificationsStorageBackend

pytestmark = pytest.mark.asyncio

_USER_A = "user-a"
_USER_B = "user-b"
_NOTIF_ID = 1
_NOW = datetime.now(UTC)


def _make_notification(notification_id: int = _NOTIF_ID) -> Notification:
    return Notification(
        id=notification_id,
        title="Alert",
        body="Something happened",
        severity=Severity.ALERT,
        correlation_id=None,
        created_by=None,
        created_at=_NOW,
    )


def _make_notification_for_user(
    notification_id: int = _NOTIF_ID,
    *,
    dismissed: bool = False,
) -> NotificationForUser:
    return NotificationForUser(
        id=notification_id,
        title="Alert",
        body="Something happened",
        severity=Severity.ALERT,
        correlation_id=None,
        created_at=_NOW,
        dismissed=dismissed,
        dismissed_at=None,
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
    async def test_no_correlation_id_dispatches_to_all(
        self,
        service: NotificationsService,
        storage: AsyncMock,
    ) -> None:
        storage.insert.return_value = _make_notification()
        result = await service.dispatch(
            title="Alert",
            body="Something happened",
            severity=Severity.ALERT,
            user_ids=[_USER_A, _USER_B],
        )
        storage.get_users_with_active_correlation.assert_not_awaited()
        assert storage.insert.call_args.kwargs["user_ids"] == [_USER_A, _USER_B]
        assert isinstance(result, Notification)
        assert result.correlation_id is None

    async def test_correlation_id_dedup_skips_active_users(
        self,
        service: NotificationsService,
        storage: AsyncMock,
    ) -> None:
        storage.get_users_with_active_correlation.return_value = {_USER_A}
        storage.insert.return_value = _make_notification()
        result = await service.dispatch(
            title="Alert",
            body="Something happened",
            severity=Severity.ALERT,
            user_ids=[_USER_A, _USER_B],
            correlation_id="corr-1",
        )
        storage.get_users_with_active_correlation.assert_awaited_once_with(
            [_USER_A, _USER_B], "corr-1"
        )
        assert storage.insert.call_args.kwargs["user_ids"] == [_USER_B]
        assert result.correlation_id is None

    async def test_correlation_id_all_deduped_inserts_empty_users(
        self,
        service: NotificationsService,
        storage: AsyncMock,
    ) -> None:
        storage.get_users_with_active_correlation.return_value = {_USER_A, _USER_B}
        storage.insert.return_value = _make_notification()
        await service.dispatch(
            title="Alert",
            body="Something happened",
            severity=Severity.ALERT,
            user_ids=[_USER_A, _USER_B],
            correlation_id="corr-1",
        )
        assert storage.insert.call_args.kwargs["user_ids"] == []

    async def test_correlation_id_no_active_dispatches_to_all(
        self,
        service: NotificationsService,
        storage: AsyncMock,
    ) -> None:
        storage.get_users_with_active_correlation.return_value = set()
        storage.insert.return_value = _make_notification()
        await service.dispatch(
            title="Alert",
            body="Something happened",
            severity=Severity.ALERT,
            user_ids=[_USER_A, _USER_B],
            correlation_id="corr-1",
        )
        assert storage.insert.call_args.kwargs["user_ids"] == [_USER_A, _USER_B]

    async def test_created_by_forwarded_to_storage(
        self,
        service: NotificationsService,
        storage: AsyncMock,
    ) -> None:
        storage.insert.return_value = _make_notification()
        await service.dispatch(
            title="Alert",
            body="Something happened",
            severity=Severity.ALERT,
            user_ids=[_USER_A],
            created_by=_USER_B,
        )
        assert storage.insert.call_args.kwargs["created_by"] == _USER_B


class TestList:
    async def test_delegates_to_storage_with_defaults(
        self,
        service: NotificationsService,
        storage: AsyncMock,
    ) -> None:
        expected = Page(items=[], total=0, page=1, size=50)
        storage.list_for_user.return_value = expected
        result = await service.list(_USER_A)
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
        await service.list(
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
    async def test_returns_notification_for_user_on_success(
        self,
        service: NotificationsService,
        storage: AsyncMock,
    ) -> None:
        expected = _make_notification_for_user(dismissed=True)
        storage.dismiss.return_value = expected
        result = await service.dismiss(_NOTIF_ID, _USER_A)
        storage.dismiss.assert_awaited_once_with(_NOTIF_ID, _USER_A)
        assert result is expected

    async def test_idempotent_already_dismissed(
        self,
        service: NotificationsService,
        storage: AsyncMock,
    ) -> None:
        already_dismissed = _make_notification_for_user(dismissed=True)
        storage.dismiss.return_value = already_dismissed
        result = await service.dismiss(_NOTIF_ID, _USER_A)
        assert result.dismissed is True

    async def test_not_found_raises_not_found_error(
        self,
        service: NotificationsService,
        storage: AsyncMock,
    ) -> None:
        storage.dismiss.return_value = None
        with pytest.raises(NotFoundError):
            await service.dismiss(_NOTIF_ID, _USER_A)
