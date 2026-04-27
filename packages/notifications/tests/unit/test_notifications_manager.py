from datetime import UTC, datetime
from unittest.mock import AsyncMock, patch

import pytest

from models.errors import NotFoundError
from models.pagination import Page, PaginationParams
from models.types import Severity
from notifications.models import Notification, NotificationForUser
from notifications.notifications_manager import NotificationsManager
from notifications.storage.protocol import NotificationsStorageBackend

pytestmark = pytest.mark.asyncio

_USER_A = "user-a"
_USER_B = "user-b"
_NOTIF_ID = "notif0000000001"
_NOW = datetime.now(UTC)


def _make_notification_for_user(
    notification_id: str = _NOTIF_ID,
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
def manager(storage: AsyncMock) -> NotificationsManager:
    return NotificationsManager(storage)


class TestClose:
    async def test_delegates_to_storage(
        self,
        manager: NotificationsManager,
        storage: AsyncMock,
    ) -> None:
        await manager.close()
        storage.close.assert_awaited_once()


class TestFromStorage:
    async def test_constructs_manager_from_url(self) -> None:
        mock_storage = AsyncMock(spec=NotificationsStorageBackend)
        with patch(
            "notifications.notifications_manager.build_notifications_storage",
            return_value=mock_storage,
        ):
            result = await NotificationsManager.from_storage("postgresql://test")
        assert isinstance(result, NotificationsManager)


class TestDispatch:
    async def test_no_correlation_id_dispatches_to_all(
        self,
        manager: NotificationsManager,
        storage: AsyncMock,
    ) -> None:
        storage.insert.return_value = None
        result = await manager.dispatch(
            title="Alert",
            body="Something happened",
            severity=Severity.ALERT,
            recipient_ids=[_USER_A, _USER_B],
        )
        storage.get_recipients_with_active_correlation.assert_not_awaited()
        assert storage.insert.call_args.args[1] == [_USER_A, _USER_B]
        assert isinstance(result, Notification)
        assert result.correlation_id is None

    async def test_correlation_id_dedup_skips_active_recipients(
        self,
        manager: NotificationsManager,
        storage: AsyncMock,
    ) -> None:
        storage.get_recipients_with_active_correlation.return_value = {_USER_A}
        storage.insert.return_value = None
        result = await manager.dispatch(
            title="Alert",
            body="Something happened",
            severity=Severity.ALERT,
            recipient_ids=[_USER_A, _USER_B],
            correlation_id="corr-1",
        )
        storage.get_recipients_with_active_correlation.assert_awaited_once_with(
            [_USER_A, _USER_B], "corr-1"
        )
        assert storage.insert.call_args.args[1] == [_USER_B]
        assert result.correlation_id == "corr-1"

    async def test_correlation_id_all_deduped_inserts_empty_recipients(
        self,
        manager: NotificationsManager,
        storage: AsyncMock,
    ) -> None:
        storage.get_recipients_with_active_correlation.return_value = {_USER_A, _USER_B}
        storage.insert.return_value = None
        await manager.dispatch(
            title="Alert",
            body="Something happened",
            severity=Severity.ALERT,
            recipient_ids=[_USER_A, _USER_B],
            correlation_id="corr-1",
        )
        assert storage.insert.call_args.args[1] == []

    async def test_correlation_id_no_active_dispatches_to_all(
        self,
        manager: NotificationsManager,
        storage: AsyncMock,
    ) -> None:
        storage.get_recipients_with_active_correlation.return_value = set()
        storage.insert.return_value = None
        await manager.dispatch(
            title="Alert",
            body="Something happened",
            severity=Severity.ALERT,
            recipient_ids=[_USER_A, _USER_B],
            correlation_id="corr-1",
        )
        assert storage.insert.call_args.args[1] == [_USER_A, _USER_B]


class TestList:
    async def test_delegates_to_storage_with_defaults(
        self,
        manager: NotificationsManager,
        storage: AsyncMock,
    ) -> None:
        expected = Page(items=[], total=0, page=1, size=50)
        storage.list_for_user.return_value = expected
        result = await manager.list(_USER_A)
        storage.list_for_user.assert_awaited_once_with(
            _USER_A,
            severity=None,
            dismissed=None,
            pagination=PaginationParams(),
        )
        assert result is expected

    async def test_passes_filters_to_storage(
        self,
        manager: NotificationsManager,
        storage: AsyncMock,
    ) -> None:
        storage.list_for_user.return_value = Page(items=[], total=0, page=2, size=10)
        pagination = PaginationParams(page=2, size=10)
        await manager.list(
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
        manager: NotificationsManager,
        storage: AsyncMock,
    ) -> None:
        expected = _make_notification_for_user(dismissed=True)
        storage.dismiss.return_value = expected
        result = await manager.dismiss(_NOTIF_ID, _USER_A)
        storage.dismiss.assert_awaited_once_with(_NOTIF_ID, _USER_A)
        assert result is expected

    async def test_idempotent_already_dismissed(
        self,
        manager: NotificationsManager,
        storage: AsyncMock,
    ) -> None:
        already_dismissed = _make_notification_for_user(dismissed=True)
        storage.dismiss.return_value = already_dismissed
        result = await manager.dismiss(_NOTIF_ID, _USER_A)
        assert result.dismissed is True

    async def test_not_found_raises_not_found_error(
        self,
        manager: NotificationsManager,
        storage: AsyncMock,
    ) -> None:
        storage.dismiss.return_value = None
        with pytest.raises(NotFoundError):
            await manager.dismiss(_NOTIF_ID, _USER_A)
