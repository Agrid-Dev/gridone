import logging
from unittest.mock import AsyncMock, MagicMock

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from api.dependencies import (
    get_current_token_payload,
    get_device_manager,
    get_ts_service,
)
from api.exception_handlers import register_exception_handlers
from api.routes.drivers_router import router
from devices_manager import DevicesServiceInterface
from devices_manager.core.driver.attribute_driver import AttributeDriver
from devices_manager.dto import Device, DriverSpec
from devices_manager.types import DataType, TransportProtocols
from models.errors import ForbiddenError, NotFoundError
from timeseries.service import TimeSeriesService

_ATTRIBUTE = AttributeDriver(
    name="temperature",
    data_type=DataType.FLOAT,
    read="GET /temp",
    codecs=[],
)

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
    mock.patch_driver = AsyncMock(return_value=_DRIVERS[0])
    mock.patch_driver_attribute = AsyncMock(return_value=_ATTRIBUTE)
    mock.delete_driver = AsyncMock()
    mock.delete_driver_attribute = AsyncMock(return_value=_DRIVERS[0])
    mock.rename_driver_attribute = AsyncMock(return_value=_ATTRIBUTE)
    mock.list_devices = MagicMock(return_value=[])
    return mock


@pytest.fixture
def ts() -> MagicMock:
    mock = MagicMock(spec=TimeSeriesService)
    mock.rename_metric_for_owners = AsyncMock()
    return mock


@pytest.fixture
def app(dm, ts, admin_token_payload) -> FastAPI:
    app = FastAPI()
    register_exception_handlers(app)
    app.include_router(router)
    app.dependency_overrides[get_device_manager] = lambda: dm
    app.dependency_overrides[get_ts_service] = lambda: ts
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
        dm.patch_driver.assert_called_once()

    def test_not_found_returns_404(self, client: TestClient, dm: MagicMock):
        dm.patch_driver.side_effect = NotFoundError("not found")
        response = client.patch("/unknown", json={"vendor": "Acme"})
        assert response.status_code == 404

    @pytest.mark.parametrize(
        "field",
        ["id", "transport", "device_config", "attributes"],
    )
    def test_immutable_field_rejected_with_422(
        self, client: TestClient, dm: MagicMock, field: str
    ):
        payload = {field: "any_value"}
        response = client.patch("/test_driver", json=payload)
        assert response.status_code == 422
        dm.patch_driver.assert_not_called()

    def test_empty_patch_ok(self, client: TestClient):
        response = client.patch("/test_driver", json={})
        assert response.status_code == 200

    def test_image_src_patch_ok(self, client: TestClient, dm: MagicMock):
        response = client.patch(
            "/test_driver", json={"image_src": "https://example.com/img.png"}
        )
        assert response.status_code == 200
        dm.patch_driver.assert_called_once()

    def test_type_patch_ok(self, client: TestClient, dm: MagicMock):
        response = client.patch("/test_driver", json={"type": "thermostat"})
        assert response.status_code == 200
        dm.patch_driver.assert_called_once()

    def test_type_null_clears_type(self, client: TestClient, dm: MagicMock):
        response = client.patch("/test_driver", json={"type": None})
        assert response.status_code == 200
        dm.patch_driver.assert_called_once()


class TestPatchAttribute:
    def test_ok_returns_updated_attribute(self, client: TestClient, dm: MagicMock):
        response = client.patch(
            "/test_driver/attributes/temperature", json={"read": "GET /temp/v2"}
        )
        assert response.status_code == 200
        dm.patch_driver_attribute.assert_called_once()

    def test_driver_not_found_returns_404(self, client: TestClient, dm: MagicMock):
        dm.patch_driver_attribute.side_effect = NotFoundError("driver not found")
        response = client.patch(
            "/unknown/attributes/temperature", json={"read": "GET /temp/v2"}
        )
        assert response.status_code == 404

    def test_attribute_not_found_returns_404(self, client: TestClient, dm: MagicMock):
        dm.patch_driver_attribute.side_effect = NotFoundError("attribute not found")
        response = client.patch(
            "/test_driver/attributes/nonexistent", json={"read": "GET /temp/v2"}
        )
        assert response.status_code == 404

    @pytest.mark.parametrize("field", ["name", "data_type"])
    def test_immutable_field_rejected_with_422(
        self, client: TestClient, dm: MagicMock, field: str
    ):
        response = client.patch(
            "/test_driver/attributes/temperature", json={field: "any_value"}
        )
        assert response.status_code == 422
        dm.patch_driver_attribute.assert_not_called()

    def test_empty_patch_ok(self, client: TestClient):
        response = client.patch("/test_driver/attributes/temperature", json={})
        assert response.status_code == 200


class TestDeleteDriver:
    def test_ok_returns_204(self, client: TestClient):
        response = client.delete("/test_driver")
        assert response.status_code == 204

    def test_not_found_returns_404(self, client: TestClient, dm: MagicMock):
        dm.delete_driver.side_effect = NotFoundError("not found")
        response = client.delete("/unknown")
        assert response.status_code == 404


class TestDeleteAttribute:
    def test_ok_returns_updated_driver(self, client: TestClient, dm: MagicMock):
        response = client.delete("/test_driver/attributes/temperature")
        assert response.status_code == 200
        assert response.json()["id"] == "test_driver"
        dm.delete_driver_attribute.assert_called_once_with("test_driver", "temperature")

    def test_driver_not_found_returns_404(self, client: TestClient, dm: MagicMock):
        dm.delete_driver_attribute.side_effect = NotFoundError("driver not found")
        response = client.delete("/unknown/attributes/temperature")
        assert response.status_code == 404

    def test_attribute_not_found_returns_404(self, client: TestClient, dm: MagicMock):
        dm.delete_driver_attribute.side_effect = NotFoundError("attribute not found")
        response = client.delete("/test_driver/attributes/nonexistent")
        assert response.status_code == 404


class TestRenameAttribute:
    def test_ok_renames_in_dm_and_ts(
        self, client: TestClient, dm: MagicMock, ts: MagicMock
    ):
        dm.list_devices.return_value = [
            Device(id="d1", name="Device 1", driver_id="test_driver"),
            Device(id="d2", name="Device 2", driver_id="test_driver"),
        ]
        response = client.post(
            "/test_driver/attributes/temperature/rename", json={"new_name": "temp"}
        )
        assert response.status_code == 200
        dm.rename_driver_attribute.assert_called_once_with(
            "test_driver", "temperature", "temp"
        )
        dm.list_devices.assert_called_once_with(driver_id="test_driver")
        ts.rename_metric_for_owners.assert_called_once_with(
            ["d1", "d2"], "temperature", "temp"
        )

    def test_driver_not_found_returns_404(
        self, client: TestClient, dm: MagicMock, ts: MagicMock
    ):
        dm.rename_driver_attribute.side_effect = NotFoundError("driver not found")
        response = client.post(
            "/unknown/attributes/temperature/rename", json={"new_name": "temp"}
        )
        assert response.status_code == 404
        ts.rename_metric_for_owners.assert_not_called()

    def test_attribute_not_found_returns_404(
        self, client: TestClient, dm: MagicMock, ts: MagicMock
    ):
        dm.rename_driver_attribute.side_effect = NotFoundError("attribute not found")
        response = client.post(
            "/test_driver/attributes/nonexistent/rename", json={"new_name": "temp"}
        )
        assert response.status_code == 404
        ts.rename_metric_for_owners.assert_not_called()

    def test_required_standard_attribute_returns_409(
        self, client: TestClient, dm: MagicMock, ts: MagicMock
    ):
        dm.rename_driver_attribute.side_effect = ForbiddenError(
            'Cannot rename "temperature" which is required for devices of type '
            '"thermostat". Change or unset the type before modifying this '
            "attribute name."
        )
        response = client.post(
            "/test_driver/attributes/temperature/rename", json={"new_name": "temp"}
        )
        assert response.status_code == 409
        ts.rename_metric_for_owners.assert_not_called()

    def test_empty_new_name_returns_422(self, client: TestClient, dm: MagicMock):
        response = client.post(
            "/test_driver/attributes/temperature/rename", json={"new_name": ""}
        )
        assert response.status_code == 422
        dm.rename_driver_attribute.assert_not_called()

    def test_ts_failure_after_dm_success_rolls_back_and_propagates(
        self,
        client: TestClient,
        dm: MagicMock,
        ts: MagicMock,
        caplog: pytest.LogCaptureFixture,
    ):
        ts.rename_metric_for_owners.side_effect = RuntimeError("db unreachable")
        with caplog.at_level(logging.ERROR), pytest.raises(RuntimeError):
            client.post(
                "/test_driver/attributes/temperature/rename", json={"new_name": "temp"}
            )
        dm.rename_driver_attribute.assert_called_with(
            "test_driver", "temp", "temperature"
        )
        assert dm.rename_driver_attribute.call_count == 2
        assert "timeseries rename failed" in caplog.text

    def test_ts_failure_and_rollback_failure_are_both_logged(
        self,
        client: TestClient,
        dm: MagicMock,
        ts: MagicMock,
        caplog: pytest.LogCaptureFixture,
    ):
        ts.rename_metric_for_owners.side_effect = RuntimeError("db unreachable")
        dm.rename_driver_attribute.side_effect = [
            _ATTRIBUTE,
            NotFoundError("driver not found"),
        ]
        with caplog.at_level(logging.ERROR), pytest.raises(RuntimeError):
            client.post(
                "/test_driver/attributes/temperature/rename", json={"new_name": "temp"}
            )
        assert "timeseries rename failed" in caplog.text
        assert "Failed to roll back" in caplog.text
