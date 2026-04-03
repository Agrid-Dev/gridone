from datetime import datetime, timezone
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from devices_manager import DevicesManager, PhysicalDevice
from devices_manager.core.device import Attribute, VirtualDevice
from devices_manager.types import DataType
from fastapi import FastAPI
from fastapi.testclient import TestClient
from httpx import ASGITransport, AsyncClient
from models.errors import InvalidError, NotFoundError
from models.pagination import Page, PaginationParams
from timeseries.domain import DeviceCommandCreate, SortOrder

from api.dependencies import (
    get_current_token_payload,
    get_current_user_id,
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
    app.dependency_overrides[get_current_user_id] = lambda: admin_token_payload.sub
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

    def test_list_devices_filter_by_type(self, client: TestClient):
        response = client.get("/", params={"type": "unknown_type"})
        assert response.status_code == 200
        assert response.json() == []

    def test_list_devices_no_filter_returns_all(self, client: TestClient):
        response = client.get("/")
        assert response.status_code == 200
        assert len(response.json()) == 1


class TestGetStandardTypes:
    def test_get_standard_types(self, client: TestClient):
        response = client.get("/standard-types")
        assert response.status_code == 200
        schemas = response.json()
        assert isinstance(schemas, list)
        assert len(schemas) >= 2
        keys = {s["key"] for s in schemas}
        assert "thermostat" in keys
        assert "awhp" in keys

    def test_standard_type_has_fields(self, client: TestClient):
        response = client.get("/standard-types")
        schemas = response.json()
        thermostat = next(s for s in schemas if s["key"] == "thermostat")
        assert len(thermostat["fields"]) > 0
        field = thermostat["fields"][0]
        assert "name" in field
        assert "required" in field
        assert "data_type" in field


class TestGetDevice:
    def test_get_device_ok(
        self, client: TestClient, mock_devices: dict[str, PhysicalDevice]
    ):
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


# ---------------------------------------------------------------------------
# Virtual device router tests
# ---------------------------------------------------------------------------


@pytest.fixture
def virtual_device() -> VirtualDevice:
    return VirtualDevice(
        id="vd1",
        name="My Virtual Sensor",
        attributes={
            "temperature": Attribute.create("temperature", DataType.FLOAT, {"read"}),
            "setpoint": Attribute.create("setpoint", DataType.FLOAT, {"read", "write"}),
        },
    )


@pytest.fixture
def app_with_virtual(
    mock_devices,
    mock_drivers,
    mock_transports,
    mock_ts_service,
    admin_token_payload,
    virtual_device,
) -> FastAPI:
    application = FastAPI()
    register_exception_handlers(application)
    application.include_router(router)

    devices_with_virtual = {**mock_devices, virtual_device.id: virtual_device}

    def get_dm() -> DevicesManager:
        return DevicesManager(
            devices=devices_with_virtual,
            drivers=mock_drivers,
            transports=mock_transports,
        )

    ws_manager = MagicMock()
    ws_manager.broadcast = AsyncMock()
    application.state.websocket_manager = ws_manager

    application.dependency_overrides[get_device_manager] = get_dm
    application.dependency_overrides[get_ts_service] = lambda: mock_ts_service
    application.dependency_overrides[get_current_token_payload] = lambda: (
        admin_token_payload
    )
    application.dependency_overrides[get_current_user_id] = lambda: (
        admin_token_payload.sub
    )
    return application


@pytest.fixture
def virtual_client(app_with_virtual) -> TestClient:
    return TestClient(app_with_virtual)


@pytest.fixture
def virtual_async_client(app_with_virtual):
    return AsyncClient(
        transport=ASGITransport(app=app_with_virtual), base_url="http://test"
    )


class TestVirtualDeviceRouterCreate:
    @pytest.mark.asyncio
    async def test_create_virtual_device_returns_201(self, virtual_async_client):
        payload = {
            "kind": "virtual",
            "name": "New Sensor",
            "attributes": [
                {"name": "co2", "data_type": "int", "read_write_mode": "read"},
            ],
        }
        async with virtual_async_client as ac:
            response = await ac.post("/", json=payload)
        assert response.status_code == 201
        data = response.json()
        assert data["kind"] == "virtual"
        assert data["name"] == "New Sensor"
        assert "co2" in data["attributes"]
        assert data["driver_id"] is None
        assert data["transport_id"] is None
        assert data["config"] is None

    @pytest.mark.asyncio
    async def test_create_virtual_device_with_driver_id_rejected(
        self, virtual_async_client
    ):
        """Virtual create must reject payloads containing driver_id, transport_id, config."""
        payload = {
            "kind": "virtual",
            "name": "Bad",
            "attributes": [
                {"name": "x", "data_type": "float", "read_write_mode": "read"}
            ],
            "driver_id": "some-driver",
        }
        async with virtual_async_client as ac:
            response = await ac.post("/", json=payload)
        assert response.status_code == 422

    @pytest.mark.asyncio
    async def test_create_virtual_device_empty_attributes_returns_422(
        self, virtual_async_client
    ):
        payload = {"kind": "virtual", "name": "Bad", "attributes": []}
        async with virtual_async_client as ac:
            response = await ac.post("/", json=payload)
        assert response.status_code == 422

    @pytest.mark.asyncio
    async def test_create_virtual_device_invalid_standard_schema_returns_422(
        self, virtual_async_client
    ):
        payload = {
            "kind": "virtual",
            "name": "Bad Thermo",
            "type": "thermostat",
            "attributes": [
                {
                    "name": "temperature",
                    "data_type": "float",
                    "read_write_mode": "read",
                },
            ],
        }
        async with virtual_async_client as ac:
            response = await ac.post("/", json=payload)
        assert response.status_code == 422


@pytest.fixture
def virtual_device_typed() -> VirtualDevice:
    """A virtual device with type='thermostat' for filter tests."""
    return VirtualDevice(
        id="vd2",
        name="Virtual Thermostat",
        type="thermostat",
        attributes={
            "temperature": Attribute.create("temperature", DataType.FLOAT, {"read"}),
        },
    )


@pytest.fixture
def client_with_typed_virtual(
    mock_devices,
    mock_drivers,
    mock_transports,
    mock_ts_service,
    admin_token_payload,
    virtual_device,
    virtual_device_typed,
) -> TestClient:
    application = FastAPI()
    register_exception_handlers(application)
    application.include_router(router)
    devices = {
        **mock_devices,
        virtual_device.id: virtual_device,
        virtual_device_typed.id: virtual_device_typed,
    }

    def get_dm() -> DevicesManager:
        return DevicesManager(
            devices=devices, drivers=mock_drivers, transports=mock_transports
        )

    application.dependency_overrides[get_device_manager] = get_dm
    application.dependency_overrides[get_ts_service] = lambda: mock_ts_service
    application.dependency_overrides[get_current_token_payload] = lambda: (
        admin_token_payload
    )
    application.dependency_overrides[get_current_user_id] = lambda: (
        admin_token_payload.sub
    )
    return TestClient(application)


class TestVirtualDeviceRouterRead:
    def test_list_devices_includes_virtual(self, virtual_client):
        response = virtual_client.get("/")
        assert response.status_code == 200
        kinds = {d["kind"] for d in response.json()}
        assert "virtual" in kinds
        assert "physical" in kinds

    def test_get_virtual_device_returns_kind_virtual(self, virtual_client):
        response = virtual_client.get("/vd1")
        assert response.status_code == 200
        data = response.json()
        assert data["kind"] == "virtual"
        assert data["id"] == "vd1"
        assert data["driver_id"] is None
        assert data["transport_id"] is None
        assert data["config"] is None
        assert "temperature" in data["attributes"]

    def test_get_virtual_device_not_found(self, virtual_client):
        response = virtual_client.get("/unknown")
        assert response.status_code == 404

    def test_list_devices_type_filter_returns_virtual(self, client_with_typed_virtual):
        """GET /devices?type=thermostat must return virtual devices with that type."""
        response = client_with_typed_virtual.get("/", params={"type": "thermostat"})
        assert response.status_code == 200
        devices = response.json()
        assert len(devices) == 1
        assert devices[0]["id"] == "vd2"
        assert devices[0]["kind"] == "virtual"


class TestVirtualDeviceRouterUpdate:
    def test_update_virtual_device_name(self, virtual_client):
        response = virtual_client.patch("/vd1", json={"name": "Renamed"})
        assert response.status_code == 200
        assert response.json()["name"] == "Renamed"

    def test_update_virtual_device_add_attribute(self, virtual_client):
        payload = {
            "attributes": [
                {
                    "name": "temperature",
                    "data_type": "float",
                    "read_write_mode": "read",
                },
                {"name": "setpoint", "data_type": "float", "read_write_mode": "write"},
                {"name": "pressure", "data_type": "float", "read_write_mode": "read"},
            ]
        }
        response = virtual_client.patch("/vd1", json=payload)
        assert response.status_code == 200
        assert "pressure" in response.json()["attributes"]

    def test_update_virtual_device_remove_attribute(self, virtual_client):
        payload = {
            "attributes": [
                {
                    "name": "temperature",
                    "data_type": "float",
                    "read_write_mode": "read",
                },
            ]
        }
        response = virtual_client.patch("/vd1", json=payload)
        assert response.status_code == 200
        attrs = response.json()["attributes"]
        assert "temperature" in attrs
        assert "setpoint" not in attrs

    def test_update_virtual_device_reject_data_type_change(self, virtual_client):
        payload = {
            "attributes": [
                {"name": "temperature", "data_type": "int", "read_write_mode": "read"},
            ]
        }
        response = virtual_client.patch("/vd1", json=payload)
        assert response.status_code == 422


class TestVirtualDeviceRouterDelete:
    def test_delete_virtual_device_ok(self, virtual_client):
        response = virtual_client.delete("/vd1")
        assert response.status_code == 204
        assert virtual_client.get("/vd1").status_code == 404


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


class TestUpdateAttributeOnVirtual:
    @pytest.mark.asyncio
    async def test_write_returns_200(self, virtual_async_client, virtual_device):
        async with virtual_async_client as ac:
            response = await ac.post(
                f"/{virtual_device.id}/setpoint", json={"value": 22.0}
            )
        assert response.status_code == 200

    @pytest.mark.asyncio
    async def test_write_logs_command(
        self, virtual_async_client, mock_ts_service, virtual_device
    ):
        async with virtual_async_client as ac:
            await ac.post(f"/{virtual_device.id}/setpoint", json={"value": 21.0})
        mock_ts_service.log_command.assert_called_once()
        cmd = mock_ts_service.log_command.call_args[0][0]
        assert isinstance(cmd, DeviceCommandCreate)
        assert cmd.device_id == virtual_device.id
        assert cmd.attribute == "setpoint"
        assert cmd.value == 21.0

    @pytest.mark.asyncio
    async def test_write_upserts_timeseries(
        self, virtual_async_client, mock_ts_service, virtual_device
    ):
        async with virtual_async_client as ac:
            await ac.post(f"/{virtual_device.id}/setpoint", json={"value": 21.0})
        mock_ts_service.upsert_points.assert_called_once()

    @pytest.mark.asyncio
    async def test_write_read_only_returns_400(
        self, virtual_async_client, virtual_device
    ):
        async with virtual_async_client as ac:
            response = await ac.post(
                f"/{virtual_device.id}/temperature", json={"value": 55.0}
            )
        assert response.status_code == 400

    @pytest.mark.asyncio
    async def test_write_unknown_attribute_returns_404(
        self, virtual_async_client, virtual_device
    ):
        async with virtual_async_client as ac:
            response = await ac.post(
                f"/{virtual_device.id}/nonexistent", json={"value": 1.0}
            )
        assert response.status_code == 404

    @pytest.mark.asyncio
    async def test_write_wrong_type_returns_400(
        self, virtual_async_client, virtual_device
    ):
        async with virtual_async_client as ac:
            response = await ac.post(
                f"/{virtual_device.id}/setpoint", json={"value": "not-a-float"}
            )
        assert response.status_code == 400

    @pytest.mark.asyncio
    async def test_confirm_false_ignored_on_virtual(
        self, virtual_async_client, virtual_device
    ):
        async with virtual_async_client as ac:
            response = await ac.post(
                f"/{virtual_device.id}/setpoint",
                json={"value": 22.0},
                params={"confirm": "false"},
            )
        assert response.status_code == 200

    @pytest.mark.asyncio
    async def test_write_triggers_attribute_listener(
        self, virtual_async_client, virtual_device
    ):
        """Listener fires on write — drives WS broadcast in prod via app.py."""
        fired: list[str] = []
        virtual_device.add_update_listener(lambda _dev, name, _attr: fired.append(name))
        async with virtual_async_client as ac:
            await ac.post(f"/{virtual_device.id}/setpoint", json={"value": 22.0})
        assert fired == ["setpoint"]


class TestUpdateDeviceState:
    @pytest.mark.asyncio
    async def test_success_returns_200(self, virtual_async_client, virtual_device):
        async with virtual_async_client as ac:
            response = await ac.put(
                f"/{virtual_device.id}/state", json={"values": {"setpoint": 25.0}}
            )
        assert response.status_code == 200
        assert response.json()["setpoint"] == 25.0

    @pytest.mark.asyncio
    async def test_success_logs_command_per_attribute(
        self, virtual_async_client, mock_ts_service, virtual_device
    ):
        async with virtual_async_client as ac:
            await ac.put(
                f"/{virtual_device.id}/state", json={"values": {"setpoint": 20.0}}
            )
        mock_ts_service.log_command.assert_called_once()

    @pytest.mark.asyncio
    async def test_success_upserts_timeseries_per_attribute(
        self, virtual_async_client, mock_ts_service, virtual_device
    ):
        async with virtual_async_client as ac:
            await ac.put(
                f"/{virtual_device.id}/state", json={"values": {"setpoint": 20.0}}
            )
        mock_ts_service.upsert_points.assert_called_once()

    @pytest.mark.asyncio
    async def test_success_broadcasts_once(
        self, app_with_virtual, virtual_async_client, virtual_device
    ):
        async with virtual_async_client as ac:
            await ac.put(
                f"/{virtual_device.id}/state", json={"values": {"setpoint": 20.0}}
            )
        app_with_virtual.state.websocket_manager.broadcast.assert_called_once()

    @pytest.mark.asyncio
    async def test_physical_device_returns_405(self, async_client, device_id):
        async with async_client as ac:
            response = await ac.put(
                f"/{device_id}/state", json={"values": {"temperature": 20.0}}
            )
        assert response.status_code == 405

    @pytest.mark.asyncio
    async def test_unknown_attribute_returns_400(
        self, virtual_async_client, virtual_device
    ):
        async with virtual_async_client as ac:
            response = await ac.put(
                f"/{virtual_device.id}/state", json={"values": {"nonexistent": 1.0}}
            )
        assert response.status_code == 400

    @pytest.mark.asyncio
    async def test_wrong_type_returns_400(self, virtual_async_client, virtual_device):
        async with virtual_async_client as ac:
            response = await ac.put(
                f"/{virtual_device.id}/state",
                json={"values": {"setpoint": "not-a-float"}},
            )
        assert response.status_code == 400

    @pytest.mark.asyncio
    async def test_empty_values_returns_200(self, virtual_async_client, virtual_device):
        async with virtual_async_client as ac:
            response = await ac.put(f"/{virtual_device.id}/state", json={"values": {}})
        assert response.status_code == 200

    @pytest.mark.asyncio
    async def test_read_only_attribute_can_be_bulk_updated(
        self, virtual_async_client, virtual_device
    ):
        """Bulk update bypasses writability — sensor push path for read-only attrs."""
        async with virtual_async_client as ac:
            response = await ac.put(
                f"/{virtual_device.id}/state",
                json={"values": {"temperature": 30.0}},
            )
        assert response.status_code == 200
        assert response.json()["temperature"] == 30.0

    @pytest.mark.asyncio
    async def test_custom_timestamp_used(
        self, virtual_async_client, mock_ts_service, virtual_device
    ):
        async with virtual_async_client as ac:
            await ac.put(
                f"/{virtual_device.id}/state",
                json={
                    "values": {"setpoint": 20.0},
                    "timestamp": "2026-01-15T12:00:00Z",
                },
            )
        cmd = mock_ts_service.log_command.call_args[0][0]
        assert cmd.timestamp.year == 2026
        assert cmd.timestamp.month == 1


_BULK_PUSH_POINT = {
    "attribute": "temperature",
    "timestamp": "2026-01-15T12:00:00Z",
    "value": 22.5,
}
_BULK_PUSH_POINT_SETPOINT = {
    "attribute": "setpoint",
    "timestamp": "2026-01-15T12:00:00Z",
    "value": 21.0,
}


class TestBulkPushTimeseries:
    @pytest.mark.asyncio
    async def test_success_returns_204(self, virtual_async_client, virtual_device):
        async with virtual_async_client as ac:
            response = await ac.post(
                f"/{virtual_device.id}/timeseries",
                json={"data": [_BULK_PUSH_POINT]},
            )
        assert response.status_code == 204

    @pytest.mark.asyncio
    async def test_success_upserts_once_per_attribute(
        self, virtual_async_client, mock_ts_service, virtual_device
    ):
        async with virtual_async_client as ac:
            await ac.post(
                f"/{virtual_device.id}/timeseries",
                json={"data": [_BULK_PUSH_POINT, _BULK_PUSH_POINT_SETPOINT]},
            )
        assert mock_ts_service.upsert_points.call_count == 2

    @pytest.mark.asyncio
    async def test_success_upserts_groups_same_attr(
        self, virtual_async_client, mock_ts_service, virtual_device
    ):
        second_point = {**_BULK_PUSH_POINT, "timestamp": "2026-01-15T13:00:00Z"}
        async with virtual_async_client as ac:
            await ac.post(
                f"/{virtual_device.id}/timeseries",
                json={"data": [_BULK_PUSH_POINT, second_point]},
            )
        mock_ts_service.upsert_points.assert_called_once()
        _, points, *_ = mock_ts_service.upsert_points.call_args[0]
        assert len(points) == 2

    @pytest.mark.asyncio
    async def test_does_not_log_command(
        self, virtual_async_client, mock_ts_service, virtual_device
    ):
        async with virtual_async_client as ac:
            await ac.post(
                f"/{virtual_device.id}/timeseries",
                json={"data": [_BULK_PUSH_POINT]},
            )
        mock_ts_service.log_command.assert_not_called()

    @pytest.mark.asyncio
    async def test_does_not_broadcast(
        self, app_with_virtual, virtual_async_client, virtual_device
    ):
        async with virtual_async_client as ac:
            await ac.post(
                f"/{virtual_device.id}/timeseries",
                json={"data": [_BULK_PUSH_POINT]},
            )
        app_with_virtual.state.websocket_manager.broadcast.assert_not_called()

    @pytest.mark.asyncio
    async def test_nonexistent_attribute_returns_404(
        self, virtual_async_client, virtual_device
    ):
        async with virtual_async_client as ac:
            response = await ac.post(
                f"/{virtual_device.id}/timeseries",
                json={
                    "data": [
                        {
                            "attribute": "nonexistent",
                            "timestamp": "2026-01-15T12:00:00Z",
                            "value": 1.0,
                        }
                    ]
                },
            )
        assert response.status_code == 404

    @pytest.mark.asyncio
    async def test_wrong_type_returns_422(
        self, virtual_async_client, mock_ts_service, virtual_device
    ):
        mock_ts_service.upsert_points.side_effect = InvalidError("type mismatch")
        async with virtual_async_client as ac:
            response = await ac.post(
                f"/{virtual_device.id}/timeseries",
                json={
                    "data": [
                        {
                            "attribute": "temperature",
                            "timestamp": "2026-01-15T12:00:00Z",
                            "value": "not-a-float",
                        }
                    ]
                },
            )
        assert response.status_code == 422

    @pytest.mark.asyncio
    async def test_unknown_device_returns_404(self, virtual_async_client):
        async with virtual_async_client as ac:
            response = await ac.post(
                "/unknown-device/timeseries",
                json={"data": [_BULK_PUSH_POINT]},
            )
        assert response.status_code == 404

    @pytest.mark.asyncio
    async def test_empty_data_returns_204(self, virtual_async_client, virtual_device):
        async with virtual_async_client as ac:
            response = await ac.post(
                f"/{virtual_device.id}/timeseries",
                json={"data": []},
            )
        assert response.status_code == 204

    @pytest.mark.asyncio
    async def test_batch_rejected_on_first_bad_point(
        self, virtual_async_client, mock_ts_service, virtual_device
    ):
        """If any point fails validation the whole batch is rejected and no upsert fires."""
        async with virtual_async_client as ac:
            response = await ac.post(
                f"/{virtual_device.id}/timeseries",
                json={
                    "data": [
                        _BULK_PUSH_POINT,
                        {
                            "attribute": "nonexistent",
                            "timestamp": "2026-01-15T13:00:00Z",
                            "value": 1.0,
                        },
                    ]
                },
            )
        assert response.status_code == 404
        mock_ts_service.upsert_points.assert_not_called()


_SINGLE_PUSH_POINT = {"timestamp": "2026-01-15T12:00:00Z", "value": 22.5}


class TestSingleAttrPushTimeseries:
    @pytest.mark.asyncio
    async def test_success_returns_204(self, virtual_async_client, virtual_device):
        async with virtual_async_client as ac:
            response = await ac.post(
                f"/{virtual_device.id}/timeseries/temperature",
                json={"data": [_SINGLE_PUSH_POINT]},
            )
        assert response.status_code == 204

    @pytest.mark.asyncio
    async def test_success_upserts_points(
        self, virtual_async_client, mock_ts_service, virtual_device
    ):
        async with virtual_async_client as ac:
            await ac.post(
                f"/{virtual_device.id}/timeseries/temperature",
                json={"data": [_SINGLE_PUSH_POINT]},
            )
        mock_ts_service.upsert_points.assert_called_once()
        key, points, *_ = mock_ts_service.upsert_points.call_args[0]
        assert key.owner_id == virtual_device.id
        assert key.metric == "temperature"
        assert len(points) == 1
        assert points[0].value == 22.5

    @pytest.mark.asyncio
    async def test_does_not_log_command(
        self, virtual_async_client, mock_ts_service, virtual_device
    ):
        async with virtual_async_client as ac:
            await ac.post(
                f"/{virtual_device.id}/timeseries/temperature",
                json={"data": [_SINGLE_PUSH_POINT]},
            )
        mock_ts_service.log_command.assert_not_called()

    @pytest.mark.asyncio
    async def test_wrong_type_returns_422(
        self, virtual_async_client, mock_ts_service, virtual_device
    ):
        mock_ts_service.upsert_points.side_effect = InvalidError("type mismatch")
        async with virtual_async_client as ac:
            response = await ac.post(
                f"/{virtual_device.id}/timeseries/temperature",
                json={"data": [{"timestamp": "2026-01-15T12:00:00Z", "value": "bad"}]},
            )
        assert response.status_code == 422

    @pytest.mark.asyncio
    async def test_nonexistent_attribute_returns_404(
        self, virtual_async_client, virtual_device
    ):
        async with virtual_async_client as ac:
            response = await ac.post(
                f"/{virtual_device.id}/timeseries/nonexistent",
                json={"data": [_SINGLE_PUSH_POINT]},
            )
        assert response.status_code == 404

    @pytest.mark.asyncio
    async def test_unknown_device_returns_404(self, virtual_async_client):
        async with virtual_async_client as ac:
            response = await ac.post(
                "/unknown-device/timeseries/temperature",
                json={"data": [_SINGLE_PUSH_POINT]},
            )
        assert response.status_code == 404

    @pytest.mark.asyncio
    async def test_multiple_points_upserted_together(
        self, virtual_async_client, mock_ts_service, virtual_device
    ):
        second_point = {"timestamp": "2026-01-15T13:00:00Z", "value": 23.0}
        async with virtual_async_client as ac:
            await ac.post(
                f"/{virtual_device.id}/timeseries/temperature",
                json={"data": [_SINGLE_PUSH_POINT, second_point]},
            )
        mock_ts_service.upsert_points.assert_called_once()
        _, points, *_ = mock_ts_service.upsert_points.call_args[0]
        assert len(points) == 2
