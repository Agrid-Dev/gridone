from datetime import UTC, datetime
from unittest.mock import MagicMock

import pytest
from devices_manager import DevicesManagerInterface
from devices_manager.dto import FaultView
from fastapi import FastAPI
from fastapi.testclient import TestClient
from models.errors import NotFoundError
from models.types import DataType, Severity

from api.dependencies import (
    get_current_token_payload,
    get_current_user_id,
    get_device_manager,
)
from api.exception_handlers import register_exception_handlers
from api.routes.faults_router import router


_FAULT_A = FaultView(
    device_id="dev-1",
    device_name="Chiller 1",
    attribute_name="alarm",
    data_type=DataType.BOOL,
    severity=Severity.ALERT,
    current_value=True,
    last_updated=datetime(2026, 4, 20, 12, 0, tzinfo=UTC),
    last_changed=datetime(2026, 4, 20, 12, 0, tzinfo=UTC),
)
_FAULT_B = FaultView(
    device_id="dev-2",
    device_name="Boiler 7",
    attribute_name="status",
    data_type=DataType.STRING,
    severity=Severity.WARNING,
    current_value="error",
    last_updated=datetime(2026, 4, 20, 11, 0, tzinfo=UTC),
    last_changed=datetime(2026, 4, 20, 11, 0, tzinfo=UTC),
)


@pytest.fixture
def dm() -> MagicMock:
    mock = MagicMock(spec=DevicesManagerInterface)
    mock.list_active_faults.return_value = [_FAULT_A, _FAULT_B]
    return mock


@pytest.fixture
def app(dm, admin_token_payload) -> FastAPI:
    app = FastAPI()
    register_exception_handlers(app)
    app.include_router(router)
    app.dependency_overrides[get_device_manager] = lambda: dm
    app.dependency_overrides[get_current_token_payload] = lambda: admin_token_payload
    app.dependency_overrides[get_current_user_id] = lambda: admin_token_payload.sub
    return app


@pytest.fixture
def client(app) -> TestClient:
    return TestClient(app)


class TestListFaults:
    def test_returns_list(self, client: TestClient):
        response = client.get("/")
        assert response.status_code == 200
        body = response.json()
        assert len(body) == 2
        assert body[0]["device_id"] == "dev-1"
        assert body[0]["attribute_name"] == "alarm"
        assert body[0]["severity"] == "alert"

    def test_no_filters_passed_to_manager(self, client: TestClient, dm: MagicMock):
        client.get("/")
        dm.list_active_faults.assert_called_once_with(severity=None, device_id=None)

    def test_severity_filter_forwarded(self, client: TestClient, dm: MagicMock):
        dm.list_active_faults.return_value = [_FAULT_A]
        response = client.get("/", params={"severity": "alert"})
        assert response.status_code == 200
        dm.list_active_faults.assert_called_once_with(
            severity=Severity.ALERT, device_id=None
        )

    def test_device_id_filter_forwarded(self, client: TestClient, dm: MagicMock):
        dm.list_active_faults.return_value = [_FAULT_A]
        response = client.get("/", params={"device_id": "dev-1"})
        assert response.status_code == 200
        dm.list_active_faults.assert_called_once_with(severity=None, device_id="dev-1")

    def test_both_filters_forwarded(self, client: TestClient, dm: MagicMock):
        dm.list_active_faults.return_value = []
        client.get("/", params={"severity": "warning", "device_id": "dev-9"})
        dm.list_active_faults.assert_called_once_with(
            severity=Severity.WARNING, device_id="dev-9"
        )

    def test_empty_list(self, client: TestClient, dm: MagicMock):
        dm.list_active_faults.return_value = []
        response = client.get("/")
        assert response.status_code == 200
        assert response.json() == []

    def test_invalid_severity_rejected(self, client: TestClient):
        response = client.get("/", params={"severity": "nope"})
        assert response.status_code == 422

    def test_unknown_device_id_returns_404(self, client: TestClient, dm: MagicMock):
        dm.list_active_faults.side_effect = NotFoundError("Device not found")
        response = client.get("/", params={"device_id": "unknown"})
        assert response.status_code == 404
