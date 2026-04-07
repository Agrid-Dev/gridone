from datetime import datetime, timezone
from unittest.mock import AsyncMock, MagicMock

import pytest
from devices_manager import DevicesManagerInterface
from devices_manager.core.device import Attribute
from devices_manager.dto.device_dto import DeviceDTO
from devices_manager.types import DataType, DeviceKind
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

# ---------------------------------------------------------------------------
# Shared device fixtures
# ---------------------------------------------------------------------------

_PHYSICAL_DEVICE = DeviceDTO(
    id="device1",
    kind=DeviceKind.PHYSICAL,
    name="My device",
    attributes={
        "temperature": Attribute.create("temperature", DataType.FLOAT, {"read"}),
        "temperature_setpoint": Attribute.create(
            "temperature_setpoint", DataType.FLOAT, {"read", "write"}
        ),
    },
    config={"some_id": "abc"},
    driver_id="test_driver",
    transport_id="my-http",
)

_VIRTUAL_DEVICE = DeviceDTO(
    id="vd1",
    kind=DeviceKind.VIRTUAL,
    name="My Virtual Sensor",
    attributes={
        "temperature": Attribute.create("temperature", DataType.FLOAT, {"read"}),
        "setpoint": Attribute.create("setpoint", DataType.FLOAT, {"read", "write"}),
    },
)

_VIRTUAL_TYPED = DeviceDTO(
    id="vd2",
    kind=DeviceKind.VIRTUAL,
    name="Virtual Thermostat",
    type="thermostat",
    attributes={
        "temperature": Attribute.create("temperature", DataType.FLOAT, {"read"}),
    },
)


def _make_dm(
    devices: list[DeviceDTO] | None = None,
) -> MagicMock:
    all_devices = {d.id: d for d in (devices or [_PHYSICAL_DEVICE])}

    mock = MagicMock(spec=DevicesManagerInterface)
    mock.list_devices.side_effect = lambda *, device_type=None: [
        d for d in all_devices.values() if device_type is None or d.type == device_type
    ]

    def _get_device(device_id: str) -> DeviceDTO:
        if device_id not in all_devices:
            raise NotFoundError(f"Device {device_id} not found")
        return all_devices[device_id]

    mock.get_device.side_effect = _get_device
    mock.device_ids = set(all_devices.keys())
    mock.add_device = AsyncMock(
        return_value=DeviceDTO(id="new-id", name="new", kind=DeviceKind.PHYSICAL)
    )
    mock.update_device = AsyncMock(return_value=_PHYSICAL_DEVICE)
    mock.delete_device = AsyncMock()
    mock.read_device = AsyncMock(return_value=_PHYSICAL_DEVICE)
    mock.write_device_attribute = AsyncMock(
        return_value=Attribute.create(
            "temperature_setpoint", DataType.FLOAT, {"read", "write"}, value=22.0
        )
    )
    mock.list_standard_schemas.return_value = []
    return mock


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------


@pytest.fixture
def mock_ts_service():
    return AsyncMock()


@pytest.fixture
def dm():
    return _make_dm()


@pytest.fixture
def app(dm, mock_ts_service, admin_token_payload) -> FastAPI:
    app = FastAPI()
    register_exception_handlers(app)
    app.include_router(router)
    app.dependency_overrides[get_device_manager] = lambda: dm
    app.dependency_overrides[get_ts_service] = lambda: mock_ts_service
    app.dependency_overrides[get_current_token_payload] = lambda: admin_token_payload
    app.dependency_overrides[get_current_user_id] = lambda: admin_token_payload.sub
    return app


@pytest.fixture
def client(app):
    return TestClient(app)


@pytest.fixture
def async_client(app):
    return AsyncClient(transport=ASGITransport(app=app), base_url="http://test")


# ---------------------------------------------------------------------------
# List devices
# ---------------------------------------------------------------------------


class TestListDevices:
    def test_returns_all(self, client: TestClient):
        response = client.get("/")
        assert response.status_code == 200
        assert len(response.json()) == 1

    def test_filter_by_type_passed_to_service(self, client: TestClient, dm: MagicMock):
        client.get("/", params={"type": "thermostat"})
        dm.list_devices.assert_called_once_with(device_type="thermostat")


# ---------------------------------------------------------------------------
# Get standard types
# ---------------------------------------------------------------------------


class TestGetStandardTypes:
    def test_returns_200(self, client: TestClient):
        response = client.get("/standard-types")
        assert response.status_code == 200


# ---------------------------------------------------------------------------
# Get device
# ---------------------------------------------------------------------------


class TestGetDevice:
    def test_ok(self, client: TestClient):
        response = client.get("/device1")
        assert response.status_code == 200
        assert response.json()["id"] == "device1"

    def test_not_found(self, client: TestClient):
        response = client.get("/unknown")
        assert response.status_code == 404


# ---------------------------------------------------------------------------
# Create device
# ---------------------------------------------------------------------------


class TestCreateDevice:
    @pytest.mark.asyncio
    async def test_ok_returns_201(self, async_client: AsyncClient, dm: MagicMock):
        async with async_client as ac:
            response = await ac.post(
                "/",
                json={
                    "name": "new",
                    "config": {"some_id": "abc"},
                    "driver_id": "test_driver",
                    "transport_id": "my-http",
                },
            )
        assert response.status_code == 201
        dm.add_device.assert_called_once()

    @pytest.mark.asyncio
    async def test_not_found_returns_404(
        self, async_client: AsyncClient, dm: MagicMock
    ):
        dm.add_device.side_effect = NotFoundError("Driver not found")
        async with async_client as ac:
            response = await ac.post(
                "/",
                json={
                    "name": "new",
                    "config": {},
                    "driver_id": "unknown",
                    "transport_id": "my-http",
                },
            )
        assert response.status_code == 404

    @pytest.mark.asyncio
    async def test_invalid_returns_422(self, async_client: AsyncClient, dm: MagicMock):
        dm.add_device.side_effect = InvalidError("missing config field")
        async with async_client as ac:
            response = await ac.post(
                "/",
                json={
                    "name": "new",
                    "config": {},
                    "driver_id": "test_driver",
                    "transport_id": "my-http",
                },
            )
        assert response.status_code == 422


# ---------------------------------------------------------------------------
# Update device
# ---------------------------------------------------------------------------


class TestUpdateDevice:
    def test_ok(self, client: TestClient):
        response = client.patch("/device1", json={"name": "New name"})
        assert response.status_code == 200

    def test_not_found(self, client: TestClient, dm: MagicMock):
        dm.update_device.side_effect = NotFoundError("not found")
        response = client.patch("/unknown", json={"name": "x"})
        assert response.status_code == 404

    def test_value_error_returns_422(self, client: TestClient, dm: MagicMock):
        dm.update_device.side_effect = ValueError("incompatible transport")
        response = client.patch("/device1", json={"driver_id": "other"})
        assert response.status_code == 422

    def test_invalid_error_returns_422(self, client: TestClient, dm: MagicMock):
        dm.update_device.side_effect = InvalidError("bad config")
        response = client.patch("/device1", json={"config": {"other": 99}})
        assert response.status_code == 422


# ---------------------------------------------------------------------------
# Delete device
# ---------------------------------------------------------------------------


class TestDeleteDevice:
    def test_ok_returns_204(self, client: TestClient):
        response = client.delete("/device1")
        assert response.status_code == 204

    def test_not_found(self, client: TestClient, dm: MagicMock):
        dm.delete_device.side_effect = NotFoundError("not found")
        response = client.delete("/unknown")
        assert response.status_code == 404


# ---------------------------------------------------------------------------
# Commands (delegates to ts_service — only test wiring)
# ---------------------------------------------------------------------------


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
    async def test_with_filters(
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
    async def test_device_scoped(
        self, async_client: AsyncClient, mock_ts_service: AsyncMock
    ):
        mock_ts_service.get_commands.return_value = Page(
            items=[], total=0, page=1, size=50
        )
        async with async_client as ac:
            response = await ac.get("/device1/commands")
        assert response.status_code == 200
        call_kwargs = mock_ts_service.get_commands.call_args[1]
        assert call_kwargs["device_id"] == "device1"


# ---------------------------------------------------------------------------
# Update attribute (write command)
# ---------------------------------------------------------------------------


class TestUpdateAttribute:
    @pytest.mark.asyncio
    async def test_success_logs_command(
        self, async_client: AsyncClient, mock_ts_service: AsyncMock
    ):
        async with async_client as ac:
            response = await ac.post(
                "/device1/temperature_setpoint", json={"value": 22.0}
            )
        assert response.status_code == 200
        mock_ts_service.log_command.assert_called_once()
        cmd = mock_ts_service.log_command.call_args[0][0]
        assert isinstance(cmd, DeviceCommandCreate)
        assert cmd.device_id == "device1"
        assert cmd.attribute == "temperature_setpoint"
        assert cmd.value == 22.0
        assert cmd.status == "success"

    @pytest.mark.asyncio
    async def test_success_upserts_point_with_command_id(
        self, async_client: AsyncClient, mock_ts_service: AsyncMock
    ):
        mock_ts_service.log_command.return_value.id = 42
        async with async_client as ac:
            response = await ac.post(
                "/device1/temperature_setpoint", json={"value": 22.0}
            )
        assert response.status_code == 200
        mock_ts_service.upsert_points.assert_called_once()
        points = mock_ts_service.upsert_points.call_args[0][1]
        assert len(points) == 1
        assert points[0].command_id == 42

    @pytest.mark.asyncio
    async def test_permission_error_returns_400(
        self, async_client: AsyncClient, mock_ts_service: AsyncMock, dm: MagicMock
    ):
        dm.write_device_attribute.side_effect = PermissionError("read-only")
        async with async_client as ac:
            response = await ac.post(
                "/device1/temperature_setpoint", json={"value": 22.0}
            )
        assert response.status_code == 400
        mock_ts_service.log_command.assert_not_called()

    @pytest.mark.asyncio
    async def test_not_found_returns_404_without_logging(
        self, async_client: AsyncClient, mock_ts_service: AsyncMock, dm: MagicMock
    ):
        dm.write_device_attribute.side_effect = NotFoundError("device not found")
        async with async_client as ac:
            response = await ac.post(
                "/device1/temperature_setpoint", json={"value": 22.5}
            )
        assert response.status_code == 404
        mock_ts_service.log_command.assert_not_called()

    @pytest.mark.asyncio
    async def test_unexpected_error_logs_error_command(
        self, async_client: AsyncClient, mock_ts_service: AsyncMock, dm: MagicMock
    ):
        dm.write_device_attribute.side_effect = ValueError("device offline")
        with pytest.raises(ValueError):
            async with async_client as ac:
                await ac.post("/device1/temperature_setpoint", json={"value": 22.5})
        mock_ts_service.log_command.assert_called_once()
        cmd = mock_ts_service.log_command.call_args[0][0]
        assert cmd.status == "error"


# ---------------------------------------------------------------------------
# Virtual device CRUD
# ---------------------------------------------------------------------------


@pytest.fixture
def dm_with_virtual():
    return _make_dm([_PHYSICAL_DEVICE, _VIRTUAL_DEVICE])


@pytest.fixture
def virtual_app(dm_with_virtual, mock_ts_service, admin_token_payload) -> FastAPI:
    app = FastAPI()
    register_exception_handlers(app)
    app.include_router(router)
    ws = MagicMock()
    ws.broadcast = AsyncMock()
    app.state.websocket_manager = ws
    app.dependency_overrides[get_device_manager] = lambda: dm_with_virtual
    app.dependency_overrides[get_ts_service] = lambda: mock_ts_service
    app.dependency_overrides[get_current_token_payload] = lambda: admin_token_payload
    app.dependency_overrides[get_current_user_id] = lambda: admin_token_payload.sub
    return app


@pytest.fixture
def virtual_client(virtual_app):
    return TestClient(virtual_app)


@pytest.fixture
def virtual_async_client(virtual_app):
    return AsyncClient(transport=ASGITransport(app=virtual_app), base_url="http://test")


class TestVirtualDeviceCreate:
    @pytest.mark.asyncio
    async def test_ok_returns_201(
        self, virtual_async_client: AsyncClient, dm_with_virtual: MagicMock
    ):
        dm_with_virtual.add_device.return_value = DeviceDTO(
            id="new-vd",
            kind=DeviceKind.VIRTUAL,
            name="New Sensor",
            attributes={
                "co2": Attribute.create("co2", DataType.INT, {"read"}),
            },
        )
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

    @pytest.mark.asyncio
    async def test_invalid_returns_422(
        self, virtual_async_client: AsyncClient, dm_with_virtual: MagicMock
    ):
        dm_with_virtual.add_device.side_effect = InvalidError("empty attributes")
        payload = {"kind": "virtual", "name": "Bad", "attributes": []}
        async with virtual_async_client as ac:
            response = await ac.post("/", json=payload)
        assert response.status_code == 422


class TestVirtualDeviceRead:
    def test_list_includes_virtual(self, virtual_client: TestClient):
        response = virtual_client.get("/")
        assert response.status_code == 200
        kinds = {d["kind"] for d in response.json()}
        assert "virtual" in kinds
        assert "physical" in kinds

    def test_get_virtual_device(self, virtual_client: TestClient):
        response = virtual_client.get("/vd1")
        assert response.status_code == 200
        data = response.json()
        assert data["kind"] == "virtual"
        assert data["driver_id"] is None
        assert data["transport_id"] is None

    def test_type_filter(self, virtual_client: TestClient, dm_with_virtual: MagicMock):
        dm_with_virtual.list_devices.side_effect = None
        dm_with_virtual.list_devices.return_value = [_VIRTUAL_TYPED]
        response = virtual_client.get("/", params={"type": "thermostat"})
        assert response.status_code == 200
        devices = response.json()
        assert len(devices) == 1
        assert devices[0]["kind"] == "virtual"


class TestVirtualDeviceUpdate:
    def test_ok(self, virtual_client: TestClient, dm_with_virtual: MagicMock):
        dm_with_virtual.update_device.return_value = DeviceDTO(
            id="vd1", kind=DeviceKind.VIRTUAL, name="Renamed"
        )
        response = virtual_client.patch("/vd1", json={"name": "Renamed"})
        assert response.status_code == 200
        assert response.json()["name"] == "Renamed"

    def test_invalid_returns_422(
        self, virtual_client: TestClient, dm_with_virtual: MagicMock
    ):
        dm_with_virtual.update_device.side_effect = InvalidError(
            "cannot change data_type"
        )
        response = virtual_client.patch(
            "/vd1",
            json={
                "attributes": [
                    {
                        "name": "temperature",
                        "data_type": "int",
                        "read_write_mode": "read",
                    }
                ]
            },
        )
        assert response.status_code == 422


class TestVirtualDeviceDelete:
    def test_ok_returns_204(self, virtual_client: TestClient):
        response = virtual_client.delete("/vd1")
        assert response.status_code == 204


# ---------------------------------------------------------------------------
# Bulk push timeseries
# ---------------------------------------------------------------------------

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
    async def test_success_returns_204(self, virtual_async_client):
        async with virtual_async_client as ac:
            response = await ac.post(
                "/vd1/timeseries", json={"data": [_BULK_PUSH_POINT]}
            )
        assert response.status_code == 204

    @pytest.mark.asyncio
    async def test_upserts_once_per_attribute(
        self, virtual_async_client, mock_ts_service
    ):
        async with virtual_async_client as ac:
            await ac.post(
                "/vd1/timeseries",
                json={"data": [_BULK_PUSH_POINT, _BULK_PUSH_POINT_SETPOINT]},
            )
        assert mock_ts_service.upsert_points.call_count == 2

    @pytest.mark.asyncio
    async def test_groups_same_attr(self, virtual_async_client, mock_ts_service):
        second = {**_BULK_PUSH_POINT, "timestamp": "2026-01-15T13:00:00Z"}
        async with virtual_async_client as ac:
            await ac.post("/vd1/timeseries", json={"data": [_BULK_PUSH_POINT, second]})
        mock_ts_service.upsert_points.assert_called_once()
        _, points, *_ = mock_ts_service.upsert_points.call_args[0]
        assert len(points) == 2

    @pytest.mark.asyncio
    async def test_nonexistent_attribute_returns_404(self, virtual_async_client):
        async with virtual_async_client as ac:
            response = await ac.post(
                "/vd1/timeseries",
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
    async def test_unknown_device_returns_404(self, virtual_async_client):
        async with virtual_async_client as ac:
            response = await ac.post(
                "/unknown-device/timeseries",
                json={"data": [_BULK_PUSH_POINT]},
            )
        assert response.status_code == 404

    @pytest.mark.asyncio
    async def test_wrong_type_returns_422(self, virtual_async_client, mock_ts_service):
        mock_ts_service.upsert_points.side_effect = InvalidError("type mismatch")
        async with virtual_async_client as ac:
            response = await ac.post(
                "/vd1/timeseries",
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


# ---------------------------------------------------------------------------
# Single-attr push timeseries
# ---------------------------------------------------------------------------

_SINGLE_PUSH_POINT = {"timestamp": "2026-01-15T12:00:00Z", "value": 22.5}


class TestSingleAttrPushTimeseries:
    @pytest.mark.asyncio
    async def test_success_returns_204(self, virtual_async_client):
        async with virtual_async_client as ac:
            response = await ac.post(
                "/vd1/timeseries/temperature",
                json={"data": [_SINGLE_PUSH_POINT]},
            )
        assert response.status_code == 204

    @pytest.mark.asyncio
    async def test_upserts_points(self, virtual_async_client, mock_ts_service):
        async with virtual_async_client as ac:
            await ac.post(
                "/vd1/timeseries/temperature",
                json={"data": [_SINGLE_PUSH_POINT]},
            )
        mock_ts_service.upsert_points.assert_called_once()

    @pytest.mark.asyncio
    async def test_nonexistent_attribute_returns_404(self, virtual_async_client):
        async with virtual_async_client as ac:
            response = await ac.post(
                "/vd1/timeseries/nonexistent",
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
