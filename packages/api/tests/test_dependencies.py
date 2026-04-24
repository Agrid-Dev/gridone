"""Unit tests for simple FastAPI dependency functions."""

from unittest.mock import MagicMock

from api.dependencies import get_apps_service, get_automations_service


class TestGetAppsService:
    def test_returns_apps_service_from_state(self):
        sentinel = object()
        request = MagicMock()
        request.app.state.apps_service = sentinel

        result = get_apps_service(request)

        assert result is sentinel


class TestGetAutomationsService:
    def test_returns_automations_service_from_state(self):
        sentinel = object()
        request = MagicMock()
        request.app.state.automations_service = sentinel

        result = get_automations_service(request)

        assert result is sentinel
