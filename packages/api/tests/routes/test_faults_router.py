from datetime import UTC, datetime, timedelta
from unittest.mock import MagicMock, patch

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from api.auth import (
    get_current_permissions,
    get_current_role,
    get_current_token_payload,
    get_current_user_id,
)
from api.dependencies import get_device_manager, get_ts_service
from api.exception_handlers import register_exception_handlers
from api.routes.faults_router import router
from devices_manager import DevicesServiceInterface
from devices_manager.dto import FaultView
from models.errors import NotFoundError
from models.types import DataType, Severity
from timeseries import TimeSeriesService
from timeseries.domain import FetchPointsBeforeResult, FetchPointsResult
from users.permissions import Permission

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
    mock = MagicMock(spec=DevicesServiceInterface)
    mock.list_active_faults.return_value = [_FAULT_A, _FAULT_B]
    return mock


@pytest.fixture
def app(dm, admin_token_payload) -> FastAPI:
    app = FastAPI()
    register_exception_handlers(app)
    app.include_router(router)
    app.dependency_overrides[get_device_manager] = lambda: dm
    app.dependency_overrides[get_current_token_payload] = lambda: admin_token_payload
    app.dependency_overrides[get_current_permissions] = lambda: frozenset(Permission)
    app.dependency_overrides[get_current_role] = lambda: None
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


# Router tests mock both services. Reconstruction regressions live beside the
# composition function in test_fault_episodes.py.
NOW = datetime(2026, 10, 15, tzinfo=UTC)


@pytest.fixture
def ts_service():
    service = MagicMock(spec=TimeSeriesService)
    service.default_timezone = "UTC"
    service.fetch_points_before.return_value = FetchPointsBeforeResult(
        [], truncated=False, next_before=None
    )
    service.fetch_points.return_value = FetchPointsResult(
        [], truncated=False, next_start=None
    )
    return service


@pytest.fixture
def episodes_client(app, dm, ts_service):
    dm.list_devices.return_value = []
    app.dependency_overrides[get_ts_service] = lambda: ts_service
    with patch("api.routes.faults_router.datetime") as clock:
        clock.now.return_value = NOW
        yield TestClient(app)


class TestListFaultEpisodes:
    def test_default_period_and_observation_time(self, episodes_client):
        body = episodes_client.get("/episodes").json()
        assert datetime.fromisoformat(body["as_of"]) == NOW
        assert datetime.fromisoformat(body["end"]) == NOW
        assert datetime.fromisoformat(body["start"]) == NOW - timedelta(days=7)
        assert body["episodes"] == []
        assert body["truncated"] is False

    def test_relative_period(self, episodes_client):
        body = episodes_client.get("/episodes", params={"last": "1d"}).json()
        assert datetime.fromisoformat(body["start"]) == NOW - timedelta(days=1)

    def test_naive_bounds_use_building_timezone(self, episodes_client, ts_service):
        ts_service.default_timezone = "America/Martinique"
        body = episodes_client.get(
            "/episodes", params={"start": "2026-10-14T08:15", "end": "2026-10-14T08:20"}
        ).json()
        assert body["start"] == "2026-10-14T12:15:00Z"
        assert body["end"] == "2026-10-14T12:20:00Z"

    @pytest.mark.parametrize(
        "params",
        [
            {"last": "soon"},
            {"start": "2026-10-15T00:00Z", "end": "2026-10-14T00:00Z"},
            {"start": "2026-10-16T00:00Z"},
        ],
    )
    def test_invalid_period(self, episodes_client, params):
        assert episodes_client.get("/episodes", params=params).status_code == 422

    def test_future_end_is_clipped_to_observation(self, episodes_client):
        body = episodes_client.get(
            "/episodes",
            params={"start": "2026-10-14T00:00Z", "end": "2026-10-16T00:00Z"},
        ).json()
        assert body["end"] == body["as_of"]
