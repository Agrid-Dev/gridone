from unittest.mock import AsyncMock, MagicMock

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from api.dependencies import get_current_token_payload, get_device_manager
from api.exception_handlers import register_exception_handlers
from api.routes.drivers_router import router
from devices_manager import DevicesServiceInterface
from devices_manager.dto import DriverSpec
from devices_manager.types import TransportProtocols
from models.errors import NotFoundError

_DRIVERS = [
    DriverSpec.model_validate(
        {
            "id": "test_driver",
            "transport": "http",
            "env": {"base_url": "http://example.com"},
            "device_config": [{"name": "some_id"}],
            "attributes": [
                {"name": "temperature", "data_type": "float", "read": "GET /temp"},
            ],
        }
    ),
    DriverSpec.model_validate(
        {
            "id": "test_push_driver",
            "transport": "mqtt",
            "env": {"host": "localhost"},
            "device_config": [{"name": "some_id"}],
            "attributes": [],
            "discovery": {
                "topic": "thermocktat/#",
                "field_getters": [
                    {"name": "device_id", "adapters": [{"json_pointer": "/device_id"}]}
                ],
            },
        }
    ),
]
_DRIVERS_BY_ID = {d.id: d for d in _DRIVERS}


@pytest.fixture
def dm() -> MagicMock:
    mock = MagicMock(spec=DevicesServiceInterface)
    mock.list_drivers.return_value = list(_DRIVERS)

    def _get_driver(driver_id: str) -> DriverSpec:
        if driver_id not in _DRIVERS_BY_ID:
            msg = f"Driver {driver_id} not found"
            raise NotFoundError(msg)
        return _DRIVERS_BY_ID[driver_id]

    mock.get_driver.side_effect = _get_driver
    mock.add_driver = AsyncMock(side_effect=lambda dto: dto)
    mock.update_driver = AsyncMock(return_value=_DRIVERS[0])
    mock.delete_driver = AsyncMock()
    return mock


@pytest.fixture
def app(dm, admin_token_payload) -> FastAPI:
    app = FastAPI()
    register_exception_handlers(app)
    app.include_router(router)
    app.dependency_overrides[get_device_manager] = lambda: dm
    app.dependency_overrides[get_current_token_payload] = lambda: admin_token_payload
    return app


@pytest.fixture
def client(app):
    return TestClient(app)


class TestListDrivers:
    def test_returns_all(self, client: TestClient):
        response = client.get("/")
        assert response.status_code == 200
        assert len(response.json()) == 2

    def test_passes_type_filter(self, client: TestClient, dm: MagicMock):
        dm.list_drivers.return_value = []
        response = client.get("/", params={"type": "thermostat"})
        assert response.status_code == 200
        assert response.json() == []
        dm.list_drivers.assert_called_once_with(device_type="thermostat")


class TestGetDriver:
    def test_ok(self, client: TestClient):
        response = client.get("/test_driver")
        assert response.status_code == 200
        assert response.json()["id"] == "test_driver"
        assert response.json()["transport"] == TransportProtocols.HTTP

    def test_not_found(self, client: TestClient):
        response = client.get("/unknown")
        assert response.status_code == 404


class TestCreateDriver:
    def test_ok_returns_201(self, client: TestClient, dm: MagicMock):
        payload = {
            "id": "new_driver",
            "transport": "http",
            "device_config": [],
            "attributes": [],
        }
        response = client.post("/", json=payload)
        assert response.status_code == 201
        dm.add_driver.assert_called_once()

    def test_conflict_returns_409(self, client: TestClient, dm: MagicMock):
        dm.add_driver.side_effect = ValueError("Driver already exists")
        payload = {
            "id": "test_driver",
            "transport": "http",
            "device_config": [],
            "attributes": [],
        }
        response = client.post("/", json=payload)
        assert response.status_code == 409

    def test_invalid_payload_returns_422(self, client: TestClient):
        response = client.post("/", json={"id": "bad"})
        assert response.status_code == 422

    def test_yaml_payload(self, client: TestClient, yaml_driver: str):
        response = client.post("/", json={"yaml": yaml_driver})
        assert response.status_code == 201


class TestPatchDriver:
    def test_ok_returns_updated_driver(self, client: TestClient, dm: MagicMock):
        response = client.patch("/test_driver", json={"vendor": "Acme"})
        assert response.status_code == 200
        dm.update_driver.assert_called_once()

    def test_not_found_returns_404(self, client: TestClient, dm: MagicMock):
        dm.update_driver.side_effect = NotFoundError("not found")
        response = client.patch("/unknown", json={"vendor": "Acme"})
        assert response.status_code == 404

    @pytest.mark.parametrize(
        "field",
        ["id", "transport", "type", "device_config", "attributes"],
    )
    def test_immutable_field_rejected_with_422(
        self, client: TestClient, dm: MagicMock, field: str
    ):
        payload = {field: "any_value"}
        response = client.patch("/test_driver", json=payload)
        assert response.status_code == 422
        dm.update_driver.assert_not_called()

    def test_empty_patch_ok(self, client: TestClient):
        response = client.patch("/test_driver", json={})
        assert response.status_code == 200


class TestDeleteDriver:
    def test_ok_returns_204(self, client: TestClient):
        response = client.delete("/test_driver")
        assert response.status_code == 204

    def test_not_found_returns_404(self, client: TestClient, dm: MagicMock):
        dm.delete_driver.side_effect = NotFoundError("not found")
        response = client.delete("/unknown")
        assert response.status_code == 404
