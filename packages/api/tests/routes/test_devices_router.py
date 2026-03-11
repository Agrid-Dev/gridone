from datetime import datetime, timezone
from unittest.mock import AsyncMock, patch

import pytest
from devices_manager import Device, DevicesManager
from fastapi import FastAPI
from fastapi.testclient import TestClient
from httpx import ASGITransport, AsyncClient
from models.errors import NotFoundError
from models.pagination import Page, PaginationParams
from timeseries.domain import DeviceCommandCreate, SortOrder

from api.dependencies import (
    get_current_token_payload,
    get_device_manager,
    get_ts_service,
)
from api.exception_handlers import register_exception_handlers
from api.routes.devices_router import router


@pytest.fixture
def mock_ts_service():
    return AsyncMock()


@pytest.fixture
def app(
    mock_devices, mock_drivers, mock_transports, mock_ts_service, admin_token_payload
) -> FastAPI:
    app = FastAPI()
    register_exception_handlers(app)
    app.include_router(router)

    def get_mock_devices_manager() -> DevicesManager:
        return DevicesManager(
            devices=mock_devices, drivers=mock_drivers, transports=mock_transports
        )

    app.dependency_overrides[get_device_manager] = get_mock_devices_manager
    app.dependency_overrides[get_ts_service] = lambda: mock_ts_service
    app.dependency_overrides[get_current_token_payload] = lambda: admin_token_payload
    return app


@pytest.fixture
def client(app):
    return TestClient(app)


class TestListDevices:
    def test_list_devices(self, client: TestClient):
        response = client.get("/")
        assert response.status_code == 200
        devices = response.json()
        assert len(devices) == 1


class TestGetDevice:
    def test_get_device_ok(self, client: TestClient, mock_devices: dict[str, Device]):
        for device_id in mock_devices:
            response = client.get(f"/{device_id}")
            assert response.status_code == 200
            device = response.json()
            assert device["id"] == device_id

    def test_get_device_not_found(self, client: TestClient):
        response = client.get("/unknown")
        assert response.status_code == 404


@pytest.fixture
def create_payload() -> dict:
    return {
        "name": "my new device",
        "config": {"some_id": "abc"},
        "driver_id": "test_driver",  # in dm from fixtures
        "transport_id": "my-http",
    }


@pytest.fixture
def async_client(app):
    return AsyncClient(transport=ASGITransport(app=app), base_url="http://test")


class TestCreateDevice:
    @pytest.mark.asyncio
    async def test_create_device_ok(
        self, async_client: AsyncClient, create_payload: dict
    ):
        async with async_client as ac:
            response = await ac.post("/", json=create_payload)
        assert response.status_code == 201
        result = response.json()
        assert "id" in result
        assert len(result["id"]) > 1
        assert result["name"] == create_payload["name"]
        assert result["config"] == create_payload["config"]

    @pytest.mark.asyncio
    async def test_create_device_invalid_transport(
        self, async_client: AsyncClient, create_payload: dict
    ):
        create_payload["transport_id"] = "unknown_transport"
        async with async_client as ac:
            response = await ac.post("/", json=create_payload)
        assert response.status_code == 404

    @pytest.mark.asyncio
    async def test_create_device_invalid_driver(
        self, async_client: AsyncClient, create_payload: dict
    ):
        create_payload["driver_id"] = "unknown_transport"
        async with async_client as ac:
            response = await ac.post("/", json=create_payload)
        assert response.status_code == 404

    @pytest.mark.asyncio
    async def test_create_device_missing_config(
        self, async_client: AsyncClient, create_payload: dict
    ):
        del create_payload["config"]["some_id"]  # misses a field required by driver
        async with async_client as ac:
            response = await ac.post("/", json=create_payload)
        assert response.status_code == 422


@pytest.fixture
def device_id(mock_devices) -> str:
    """Returns the first id of mock devices (dm fixtures)."""
    return next(iter(mock_devices.keys()))


class TestUpdateDevice:
    def test_update_device_name(self, client: TestClient, device_id: str):
        new_name = "New name"
        response = client.patch(f"/{device_id}", json={"name": new_name})
        assert response.status_code == 200
        read_response = client.get(f"/{device_id}")
        updated_device = read_response.json()
        assert updated_device["name"] == new_name

    def test_update_device_config_ok(self, client: TestClient, device_id: str):
        new_config = {"some_id": "def"}
        response = client.patch(f"/{device_id}", json={"config": new_config})
        assert response.status_code == 200
        read_response = client.get(f"/{device_id}")
        updated_device = read_response.json()
        assert updated_device["config"] == new_config

    def test_update_device_config_invalid(self, client: TestClient, device_id: str):
        new_config = {"other": 99}
        response = client.patch(f"/{device_id}", json={"config": new_config})
        assert response.status_code == 422

    def test_update_device_driver_not_found(self, client: TestClient, device_id: str):
        response = client.patch(f"/{device_id}", json={"driver_id": "unknown"})
        assert response.status_code == 404

    def test_update_device_transport_not_found(
        self, client: TestClient, device_id: str
    ):
        response = client.patch(f"/{device_id}", json={"transport_id": "unknown"})
        assert response.status_code == 404

    def test_update_device_driver_protocol_mismatch(
        self, client: TestClient, device_id: str
    ):
        response = client.patch(f"/{device_id}", json={"driver_id": "test_push_driver"})
        assert response.status_code == 422

    def test_update_atomic(self, client: TestClient, device_id: str):
        """Update is all or nothing"""
        previous = client.get(f"/{device_id}").json()
        update_response = client.patch(
            f"/{device_id}",
            json={
                "name": "my new name",
                "config": {"some_id": "bcd"},
                "transport_id": "unknown",
            },
        )
        assert update_response.status_code == 404
        current = client.get(f"/{device_id}").json()
        assert current == previous


class TestDeleteDevice:
    @pytest.mark.asyncio
    async def test_delete_device_ok(self, client: TestClient, mock_devices):
        device_ids = list(mock_devices.keys())
        assert len(device_ids) >= 1, "Require at least one device to test deletion"
        for device_id in device_ids:
            response = client.delete(f"/{device_id}")
            assert response.status_code == 204

    @pytest.mark.asyncio
    async def test_delete_device_not_found(self, client: TestClient):
        response = client.delete("/unknown")
        assert response.status_code == 404


class TestGetDevicesCommands:
    @pytest.mark.asyncio
    async def test_no_filters(
        self, async_client: AsyncClient, mock_ts_service: AsyncMock
    ):
        mock_ts_service.get_commands.return_value = Page(
            items=[], total=0, page=1, size=50
        )
        async with async_client as ac:
            response = await ac.get("/commands")
        assert response.status_code == 200
        data = response.json()
        assert data["items"] == []
        assert data["total"] == 0
        assert data["page"] == 1
        assert data["size"] == 50
        assert data["total_pages"] == 0
        assert "links" in data
        mock_ts_service.get_commands.assert_called_once_with(
            ids=None,
            device_id=None,
            attribute=None,
            user_id=None,
            start=None,
            end=None,
            last=None,
            sort=SortOrder.ASC,
            pagination=PaginationParams(page=1, size=50),
        )

    @pytest.mark.asyncio
    async def test_with_all_filters(
        self, async_client: AsyncClient, mock_ts_service: AsyncMock
    ):
        mock_ts_service.get_commands.return_value = Page(
            items=[], total=0, page=1, size=50
        )
        start = datetime(2026, 1, 1, tzinfo=timezone.utc)
        end = datetime(2026, 1, 31, tzinfo=timezone.utc)
        async with async_client as ac:
            response = await ac.get(
                "/commands",
                params={
                    "device_id": "dev-1",
                    "attribute": "temperature",
                    "user_id": "user-42",
                    "start": start.isoformat(),
                    "end": end.isoformat(),
                    "last": "7d",
                },
            )
        assert response.status_code == 200
        mock_ts_service.get_commands.assert_called_once_with(
            ids=None,
            device_id="dev-1",
            attribute="temperature",
            user_id="user-42",
            start=start,
            end=end,
            last="7d",
            sort=SortOrder.ASC,
            pagination=PaginationParams(page=1, size=50),
        )

    @pytest.mark.asyncio
    async def test_custom_page_and_size(
        self, async_client: AsyncClient, mock_ts_service: AsyncMock
    ):
        mock_ts_service.get_commands.return_value = Page(
            items=[], total=100, page=2, size=10
        )
        async with async_client as ac:
            response = await ac.get("/commands", params={"page": 2, "size": 10})
        assert response.status_code == 200
        data = response.json()
        assert data["page"] == 2
        assert data["size"] == 10
        assert data["total_pages"] == 10
        mock_ts_service.get_commands.assert_called_once_with(
            ids=None,
            device_id=None,
            attribute=None,
            user_id=None,
            start=None,
            end=None,
            last=None,
            sort=SortOrder.ASC,
            pagination=PaginationParams(page=2, size=10),
        )

    @pytest.mark.asyncio
    async def test_sort_param_passed_to_service(
        self, async_client: AsyncClient, mock_ts_service: AsyncMock
    ):
        mock_ts_service.get_commands.return_value = Page(
            items=[], total=0, page=1, size=50
        )
        async with async_client as ac:
            response = await ac.get("/commands", params={"sort": "desc"})
        assert response.status_code == 200
        mock_ts_service.get_commands.assert_called_once_with(
            ids=None,
            device_id=None,
            attribute=None,
            user_id=None,
            start=None,
            end=None,
            last=None,
            sort=SortOrder.DESC,
            pagination=PaginationParams(page=1, size=50),
        )


class TestGetCommandsByIds:
    @pytest.mark.asyncio
    async def test_ids_param_passed_to_service(
        self, async_client: AsyncClient, mock_ts_service: AsyncMock
    ):
        mock_ts_service.get_commands.return_value = Page(
            items=[], total=0, page=1, size=1
        )
        async with async_client as ac:
            response = await ac.get("/commands", params={"ids": [1, 2, 3]})
        assert response.status_code == 200
        data = response.json()
        assert data["items"] == []
        assert data["total"] == 0
        mock_ts_service.get_commands.assert_called_once_with(
            ids=[1, 2, 3],
            device_id=None,
            attribute=None,
            user_id=None,
            start=None,
            end=None,
            last=None,
            sort=SortOrder.ASC,
            pagination=PaginationParams(page=1, size=50),
        )

    @pytest.mark.asyncio
    async def test_ids_with_other_filters_returns_422(
        self, async_client: AsyncClient, mock_ts_service: AsyncMock
    ):
        from models.errors import InvalidError

        mock_ts_service.get_commands.side_effect = InvalidError(
            "Cannot combine 'ids' with other filters"
        )
        async with async_client as ac:
            response = await ac.get(
                "/commands", params={"ids": [1], "device_id": "dev-1"}
            )
        assert response.status_code == 422


class TestGetDeviceCommands:
    @pytest.mark.asyncio
    async def test_path_device_id_takes_precedence_over_query_param(
        self, async_client: AsyncClient, mock_ts_service: AsyncMock, device_id: str
    ):
        mock_ts_service.get_commands.return_value = Page(
            items=[], total=0, page=1, size=50
        )
        async with async_client as ac:
            response = await ac.get(
                f"/{device_id}/commands",
                params={"device_id": "other-device"},
            )
        assert response.status_code == 200
        data = response.json()
        assert "items" in data
        assert "links" in data
        mock_ts_service.get_commands.assert_called_once_with(
            ids=None,
            device_id=device_id,
            attribute=None,
            user_id=None,
            start=None,
            end=None,
            last=None,
            sort=SortOrder.ASC,
            pagination=PaginationParams(page=1, size=50),
        )


class TestUpdateAttribute:
    @pytest.mark.asyncio
    async def test_success_logs_command(
        self, async_client: AsyncClient, mock_ts_service: AsyncMock, device_id: str
    ):
        with patch.object(
            DevicesManager, "write_device_attribute", new_callable=AsyncMock
        ):
            async with async_client as ac:
                response = await ac.post(
                    f"/{device_id}/temperature_setpoint",
                    json={"value": 22.0},
                )
        assert response.status_code == 200
        mock_ts_service.log_command.assert_called_once()
        cmd = mock_ts_service.log_command.call_args[0][0]
        assert isinstance(cmd, DeviceCommandCreate)
        assert cmd.device_id == device_id
        assert cmd.attribute == "temperature_setpoint"
        assert cmd.value == 22.0
        assert cmd.user_id == "test-user"
        assert cmd.status == "success"
        assert cmd.status_details is None

    @pytest.mark.asyncio
    async def test_success_upserts_point_with_command_id(
        self, async_client: AsyncClient, mock_ts_service: AsyncMock, device_id: str
    ):
        mock_ts_service.log_command.return_value.id = 42
        with patch.object(
            DevicesManager, "write_device_attribute", new_callable=AsyncMock
        ):
            async with async_client as ac:
                response = await ac.post(
                    f"/{device_id}/temperature_setpoint",
                    json={"value": 22.0},
                )
        assert response.status_code == 200
        mock_ts_service.upsert_points.assert_called_once()
        points = mock_ts_service.upsert_points.call_args[0][1]
        assert len(points) == 1
        assert points[0].command_id == 42

    @pytest.mark.asyncio
    async def test_permission_error_returns_400_without_logging(
        self, async_client: AsyncClient, mock_ts_service: AsyncMock, device_id: str
    ):
        with patch.object(
            DevicesManager,
            "write_device_attribute",
            new_callable=AsyncMock,
            side_effect=PermissionError("read-only attribute"),
        ):
            async with async_client as ac:
                response = await ac.post(
                    f"/{device_id}/temperature_setpoint",
                    json={"value": 22.0},
                )
        assert response.status_code == 400
        mock_ts_service.log_command.assert_not_called()

    @pytest.mark.asyncio
    async def test_internal_error_returns_500_and_logs(
        self, async_client: AsyncClient, mock_ts_service: AsyncMock, device_id: str
    ):
        test_error_message = "The device is offline"
        with patch.object(
            DevicesManager,
            "write_device_attribute",
            new_callable=AsyncMock,
            side_effect=ValueError(test_error_message),
        ):
            with pytest.raises(ValueError):  # AsyncClient does not absorb errors
                async with async_client as ac:
                    response = await ac.post(
                        f"/{device_id}/temperature_setpoint",
                        json={"value": 22.5},
                    )
                assert response.status_code == 500
                mock_ts_service.log_command.assert_called_once()
                cmd = mock_ts_service.log_command.call_args[0][0]
                assert isinstance(cmd, DeviceCommandCreate)
                assert cmd.device_id == device_id
                assert cmd.attribute == "temperature_setpoint"
                assert cmd.value == 22.5
                assert cmd.status == "error"
                assert cmd.status_details == test_error_message

    @pytest.mark.asyncio
    async def test_returns_404_if_does_not_log_if_device_not_found(
        self, async_client: AsyncClient, mock_ts_service: AsyncMock, device_id: str
    ):
        with patch.object(
            DevicesManager,
            "write_device_attribute",
            new_callable=AsyncMock,
            side_effect=NotFoundError("device not found"),
        ):
            async with async_client as ac:
                response = await ac.post(
                    f"/{device_id}/temperature_setpoint",
                    json={"value": 22.5},
                )
            assert response.status_code == 404
            mock_ts_service.log_command.assert_not_called()
