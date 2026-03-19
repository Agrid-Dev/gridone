"""Unit tests for simple FastAPI dependency functions."""

from unittest.mock import MagicMock

from api.dependencies import get_apps_manager


class TestGetAppsManager:
    def test_returns_apps_manager_from_state(self):
        sentinel = object()
        request = MagicMock()
        request.app.state.apps_manager = sentinel

        result = get_apps_manager(request)

        assert result is sentinel
