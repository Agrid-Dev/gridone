from datetime import UTC, datetime
from unittest.mock import AsyncMock, MagicMock

import pytest
from commands import CommandsServiceInterface, UnitCommand
from commands.models import CommandStatus
from devices_manager import DevicesManagerInterface
from devices_manager.core.device import Attribute
from devices_manager.dto.device_dto import Device
from devices_manager.types import DataType, DeviceKind
from fastapi import FastAPI
from fastapi.testclient import TestClient
from httpx import ASGITransport, AsyncClient
from models.errors import InvalidError, NotFoundError
from models.pagination import Page, PaginationParams
from models.types import SortOrder

from api.dependencies import (
    get_commands_service,
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

_PHYSICAL_DEVICE = Device(
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
    is_faulty=False,
)

_VIRTUAL_DEVICE = Device(
    id="vd1",
    kind=DeviceKind.VIRTUAL,
    name="My Virtual Sensor",
    attributes={
        "temperature": Attribute.create("temperature", DataType.FLOAT, {"read"}),
        "setpoint": Attribute.create("setpoint", DataType.FLOAT, {"read", "write"}),
    },
    is_faulty=False,
)

_VIRTUAL_TYPED = Device(
    id="vd2",
    kind=DeviceKind.VIRTUAL,
    name="Virtual Thermostat",
    type="thermostat",
    attributes={
        "temperature": Attribute.create("temperature", DataType.FLOAT, {"read"}),
    },
    is_faulty=False,
)


def _make_dm(
    devices: list[Device] | None = None,
) -> MagicMock:
    all_devices = {d.id: d for d in (devices or [_PHYSICAL_DEVICE])}

    mock = MagicMock(spec=DevicesManagerInterface)

    def _list_devices(  # noqa: PLR0913
        *,
        ids=None,
        types=None,
        tags=None,  # noqa: ARG001
        writable_attribute=None,
        writable_attribute_type=None,  # noqa: ARG001
        is_faulty=None,
    ):
        results = list(all_devices.values())
        if ids is not None:
            id_set = set(ids)
            results = [d for d in results if d.id in id_set]
        if types is not None:
            types_set = set(types)
            results = [d for d in results if d.type in types_set]
        if writable_attribute is not None:
            results = [
                d
                for d in results
                if writable_attribute in d.attributes
                and "write" in d.attributes[writable_attribute].read_write_modes
            ]
        if is_faulty is not None:
            results = [d for d in results if d.is_faulty == is_faulty]
        return results

    mock.list_devices.side_effect = _list_devices

    def _get_device(device_id: str) -> Device:
        if device_id not in all_devices:
            raise NotFoundError(f"Device {device_id} not found")
        return all_devices[device_id]

    mock.get_device.side_effect = _get_device
    mock.device_ids = set(all_devices.keys())
    mock.add_device = AsyncMock(
        return_value=Device(
            id="new-id", name="new", kind=DeviceKind.PHYSICAL, is_faulty=False
        )
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

    updated = _PHYSICAL_DEVICE.model_copy(update={"tags": {"asset_id": "a1"}})
    mock.set_device_tag = AsyncMock(return_value=updated)
    mock.delete_device_tag = AsyncMock(
        return_value=_PHYSICAL_DEVICE.model_copy(update={"tags": {}})
    )
    return mock


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------


@pytest.fixture
def mock_ts_service():
    return AsyncMock()


@pytest.fixture
def mock_commands_service():
    return AsyncMock(spec=CommandsServiceInterface)


@pytest.fixture
def dm():
    return _make_dm()


@pytest.fixture
def app(dm, mock_ts_service, mock_commands_service, admin_token_payload) -> FastAPI:
    app = FastAPI()
    register_exception_handlers(app)
    app.include_router(router)
    app.dependency_overrides[get_device_manager] = lambda: dm
    app.dependency_overrides[get_ts_service] = lambda: mock_ts_service
    app.dependency_overrides[get_commands_service] = lambda: mock_commands_service
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
        dm.list_devices.assert_called_once_with(
            ids=None, types=["thermostat"], tags=None, is_faulty=None
        )

    def test_filter_by_tags_single_value(self, client: TestClient, dm: MagicMock):
        client.get("/", params={"tags": "asset_id:asset-1"})
        dm.list_devices.assert_called_once_with(
            ids=None, types=None, tags={"asset_id": ["asset-1"]}, is_faulty=None
        )

    def test_filter_by_tags_multiple_values_and_keys(
        self, client: TestClient, dm: MagicMock
    ):
        client.get(
            "/",
            params=[  # ty: ignore[invalid-argument-type]
                ("tags", "asset_id:a1"),
                ("tags", "asset_id:a2"),
                ("tags", "zone:north"),
            ],
        )
        dm.list_devices.assert_called_once_with(
            ids=None,
            types=None,
            tags={"asset_id": ["a1", "a2"], "zone": ["north"]},
            is_faulty=None,
        )

    def test_empty_tags_param_ignored(self, client: TestClient, dm: MagicMock):
        client.get("/")
        dm.list_devices.assert_called_once_with(
            ids=None, types=None, tags=None, is_faulty=None
        )

    def test_is_faulty_filter_forwarded(self, client: TestClient, dm: MagicMock):
        client.get("/", params={"is_faulty": "true"})
        dm.list_devices.assert_called_once_with(
            ids=None, types=None, tags=None, is_faulty=True
        )

    def test_is_faulty_false_filter_forwarded(self, client: TestClient, dm: MagicMock):
        client.get("/", params={"is_faulty": "false"})
        dm.list_devices.assert_called_once_with(
            ids=None, types=None, tags=None, is_faulty=False
        )

    def test_asset_id_translated_to_tag(self, client: TestClient, dm: MagicMock):
        client.get("/", params={"asset_id": "a1"})
        dm.list_devices.assert_called_once_with(
            ids=None, types=None, tags={"asset_id": ["a1"]}, is_faulty=None
        )

    def test_asset_id_merges_into_existing_asset_tag(
        self, client: TestClient, dm: MagicMock
    ):
        client.get(
            "/",
            params=[  # ty: ignore[invalid-argument-type]
                ("tags", "asset_id:a1"),
                ("asset_id", "a2"),
            ],
        )
        dm.list_devices.assert_called_once_with(
            ids=None, types=None, tags={"asset_id": ["a1", "a2"]}, is_faulty=None
        )


# ---------------------------------------------------------------------------
# Type filter side_effect on virtual_client uses the legacy single-keyword
# signature, so reset before each test that wants to override the result.
# ---------------------------------------------------------------------------


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
# Single-device command — POST /devices/{device_id}/commands
# ---------------------------------------------------------------------------


def _completed_command(
    *,
    device_id: str = "device1",
    attribute: str = "temperature_setpoint",
    value: float = 22.0,
    status: CommandStatus = CommandStatus.SUCCESS,
) -> UnitCommand:
    now = datetime(2026, 1, 1, tzinfo=UTC)
    return UnitCommand(
        id=1,
        batch_id=None,
        template_id=None,
        device_id=device_id,
        attribute=attribute,
        value=value,
        data_type=DataType.FLOAT,
        status=status,
        status_details=None,
        user_id="test-user",
        created_at=now,
        executed_at=now,
        completed_at=now,
    )


class TestDispatchSingleCommand:
    @pytest.mark.asyncio
    async def test_success_returns_200_with_command(
        self, async_client: AsyncClient, mock_commands_service: AsyncMock
    ):
        mock_commands_service.dispatch_unit.return_value = _completed_command()
        async with async_client as ac:
            response = await ac.post(
                "/device1/commands",
                json={"attribute": "temperature_setpoint", "value": 22.0},
            )
        assert response.status_code == 200
        body = response.json()
        assert body["device_id"] == "device1"
        assert body["status"] == "success"

        mock_commands_service.dispatch_unit.assert_awaited_once()
        kwargs = mock_commands_service.dispatch_unit.call_args.kwargs
        assert kwargs["device_id"] == "device1"
        assert kwargs["write"].attribute == "temperature_setpoint"
        assert kwargs["write"].value == 22.0
        assert kwargs["write"].data_type == DataType.FLOAT
        assert kwargs["confirm"] is True

    @pytest.mark.asyncio
    async def test_confirm_false_passed_through(
        self, async_client: AsyncClient, mock_commands_service: AsyncMock
    ):
        mock_commands_service.dispatch_unit.return_value = _completed_command()
        async with async_client as ac:
            await ac.post(
                "/device1/commands",
                json={
                    "attribute": "temperature_setpoint",
                    "value": 22.0,
                    "confirm": False,
                },
            )
        kwargs = mock_commands_service.dispatch_unit.call_args.kwargs
        assert kwargs["confirm"] is False

    @pytest.mark.asyncio
    async def test_writer_failure_returns_200_with_error_status(
        self, async_client: AsyncClient, mock_commands_service: AsyncMock
    ):
        # dispatch_unit absorbs writer exceptions and returns the ERROR command,
        # so the route should still return 200.
        mock_commands_service.dispatch_unit.return_value = _completed_command(
            status=CommandStatus.ERROR,
        )
        async with async_client as ac:
            response = await ac.post(
                "/device1/commands",
                json={"attribute": "temperature_setpoint", "value": 22.0},
            )
        assert response.status_code == 200
        assert response.json()["status"] == "error"

    @pytest.mark.asyncio
    async def test_unknown_device_returns_404(self, async_client: AsyncClient):
        async with async_client as ac:
            response = await ac.post(
                "/unknown/commands",
                json={"attribute": "temperature_setpoint", "value": 22.0},
            )
        assert response.status_code == 404

    @pytest.mark.asyncio
    async def test_unknown_attribute_returns_422(self, async_client: AsyncClient):
        # device1 doesn't have a writable 'nonexistent' attribute → 422 from
        # resolve_attribute_data_type, not 500 from a raw KeyError.
        async with async_client as ac:
            response = await ac.post(
                "/device1/commands",
                json={"attribute": "nonexistent", "value": 1},
            )
        assert response.status_code == 422

    @pytest.mark.asyncio
    async def test_read_only_attribute_returns_422(self, async_client: AsyncClient):
        # 'temperature' on device1 is read-only — no device exposes it as
        # writable, so the helper raises InvalidError (422).
        async with async_client as ac:
            response = await ac.post(
                "/device1/commands",
                json={"attribute": "temperature", "value": 22.0},
            )
        assert response.status_code == 422


# ---------------------------------------------------------------------------
# Batch command — POST /devices/commands
# ---------------------------------------------------------------------------


def _batch_commands(batch_id: str, device_ids: list[str]) -> list[UnitCommand]:
    now = datetime(2026, 1, 1, tzinfo=UTC)
    return [
        UnitCommand(
            id=i,
            batch_id=batch_id,
            template_id=None,
            device_id=device_id,
            attribute="temperature_setpoint",
            value=22.5,
            data_type=DataType.FLOAT,
            status=CommandStatus.PENDING,
            status_details=None,
            user_id="test-user",
            created_at=now,
            executed_at=now,
            completed_at=None,
        )
        for i, device_id in enumerate(device_ids, start=1)
    ]


_TYPED_WRITABLE_DEVICE = Device(
    id="thermo1",
    kind=DeviceKind.PHYSICAL,
    name="Thermostat 1",
    type="thermostat",
    attributes={
        "setpoint": Attribute.create("setpoint", DataType.FLOAT, {"read", "write"}),
    },
    is_faulty=False,
)


class TestDispatchBatchCommand:
    @pytest.fixture
    def dm(self):
        # Include a typed, writable device so the types-based target below
        # exercises the dm.list_devices(types=...) path.
        return _make_dm([_PHYSICAL_DEVICE, _TYPED_WRITABLE_DEVICE])

    @pytest.mark.asyncio
    async def test_ids_target_returns_202(
        self, async_client: AsyncClient, mock_commands_service: AsyncMock
    ):
        mock_commands_service.dispatch_batch.return_value = _batch_commands(
            "abc123", ["device1", "device1"]
        )
        async with async_client as ac:
            response = await ac.post(
                "/commands",
                json={
                    "target": {"ids": ["device1", "device1"]},
                    "attribute": "temperature_setpoint",
                    "value": 22.5,
                },
            )
        assert response.status_code == 202
        assert response.json() == {"batch_id": "abc123", "total": 2}

        kwargs = mock_commands_service.dispatch_batch.call_args.kwargs
        assert kwargs["target"] == {"ids": ["device1", "device1"]}
        assert kwargs["write"].attribute == "temperature_setpoint"
        assert kwargs["write"].value == 22.5
        assert kwargs["write"].data_type == DataType.FLOAT
        assert kwargs["confirm"] is True

    @pytest.mark.asyncio
    async def test_types_filter_target_returns_202(
        self, async_client: AsyncClient, mock_commands_service: AsyncMock
    ):
        mock_commands_service.dispatch_batch.return_value = _batch_commands(
            "grp-t", ["thermo1"]
        )
        async with async_client as ac:
            response = await ac.post(
                "/commands",
                json={
                    "target": {"types": ["thermostat"]},
                    "attribute": "setpoint",
                    "value": 21.0,
                },
            )
        assert response.status_code == 202
        assert response.json() == {"batch_id": "grp-t", "total": 1}

        kwargs = mock_commands_service.dispatch_batch.call_args.kwargs
        assert kwargs["target"] == {"types": ["thermostat"]}

    @pytest.mark.asyncio
    async def test_asset_id_preserved_in_target(
        self, async_client: AsyncClient, mock_commands_service: AsyncMock
    ):
        # asset_id is intent-preserving: the service receives it verbatim so
        # saved templates can round-trip it back to the UI. The translation
        # into a `tags["asset_id"]` filter happens inside the composition-root
        # resolver, not at the HTTP boundary.
        mock_commands_service.dispatch_batch.return_value = _batch_commands(
            "grp-a", ["thermo1"]
        )
        async with async_client as ac:
            response = await ac.post(
                "/commands",
                json={
                    "target": {"asset_id": "a1", "types": ["thermostat"]},
                    "attribute": "setpoint",
                    "value": 21.0,
                },
            )
        assert response.status_code == 202
        kwargs = mock_commands_service.dispatch_batch.call_args.kwargs
        assert kwargs["target"] == {"asset_id": "a1", "types": ["thermostat"]}

    @pytest.mark.asyncio
    async def test_unknown_target_key_returns_422(self, async_client: AsyncClient):
        async with async_client as ac:
            response = await ac.post(
                "/commands",
                json={
                    "target": {"ids": ["device1"], "sibling": "nope"},
                    "attribute": "temperature_setpoint",
                    "value": 22.5,
                },
            )
        assert response.status_code == 422

    @pytest.mark.asyncio
    async def test_target_resolves_to_empty_returns_422(
        self, async_client: AsyncClient, mock_commands_service: AsyncMock
    ):
        mock_commands_service.dispatch_batch.return_value = []
        async with async_client as ac:
            response = await ac.post(
                "/commands",
                json={
                    "target": {"ids": ["device1"]},
                    "attribute": "temperature_setpoint",
                    "value": 22.5,
                },
            )
        assert response.status_code == 422

    @pytest.mark.asyncio
    async def test_no_matching_devices_for_attribute_returns_422(
        self, async_client: AsyncClient
    ):
        # The target filter (types=unknown_type) has no writable
        # devices for 'setpoint', so resolve_attribute_data_type_for_target
        # raises InvalidError → 422 before the service is invoked.
        async with async_client as ac:
            response = await ac.post(
                "/commands",
                json={
                    "target": {"types": ["unknown_type"]},
                    "attribute": "setpoint",
                    "value": 21.0,
                },
            )
        assert response.status_code == 422

    @pytest.mark.asyncio
    async def test_no_device_writes_attribute_returns_422(
        self, async_client: AsyncClient
    ):
        # 'temperature' on device1 is read-only, so no device can write it.
        async with async_client as ac:
            response = await ac.post(
                "/commands",
                json={
                    "target": {"ids": ["device1"]},
                    "attribute": "temperature",
                    "value": 22.5,
                },
            )
        # InvalidError -> 422 by global exception handler.
        assert response.status_code == 422


# ---------------------------------------------------------------------------
# List commands — GET /devices/commands and GET /devices/{device_id}/commands
# ---------------------------------------------------------------------------


def _empty_page() -> Page:
    return Page(items=[], total=0, page=1, size=50)


class TestListCommands:
    @pytest.mark.asyncio
    async def test_no_filters(
        self, async_client: AsyncClient, mock_commands_service: AsyncMock
    ):
        mock_commands_service.get_commands.return_value = _empty_page()
        async with async_client as ac:
            response = await ac.get("/commands")
        assert response.status_code == 200
        mock_commands_service.get_commands.assert_called_once_with(
            ids=None,
            batch_id=None,
            template_id=None,
            device_id=None,
            attribute=None,
            user_id=None,
            start=None,
            end=None,
            sort=SortOrder.ASC,
            pagination=PaginationParams(page=1, size=50),
        )

    @pytest.mark.asyncio
    async def test_with_full_filters(
        self, async_client: AsyncClient, mock_commands_service: AsyncMock
    ):
        mock_commands_service.get_commands.return_value = _empty_page()
        start = datetime(2026, 1, 1, tzinfo=UTC)
        end = datetime(2026, 1, 31, tzinfo=UTC)
        async with async_client as ac:
            response = await ac.get(
                "/commands",
                params={
                    "batch_id": "abc1234567890def",
                    "template_id": "tmpl00000000001",
                    "device_id": "dev-1",
                    "attribute": "temperature",
                    "user_id": "user-42",
                    "start": start.isoformat(),
                    "end": end.isoformat(),
                    "sort": "desc",
                },
            )
        assert response.status_code == 200
        mock_commands_service.get_commands.assert_called_once_with(
            ids=None,
            batch_id="abc1234567890def",
            template_id="tmpl00000000001",
            device_id="dev-1",
            attribute="temperature",
            user_id="user-42",
            start=start,
            end=end,
            sort=SortOrder.DESC,
            pagination=PaginationParams(page=1, size=50),
        )

    @pytest.mark.asyncio
    async def test_template_id_filter_forwarded(
        self, async_client: AsyncClient, mock_commands_service: AsyncMock
    ):
        mock_commands_service.get_commands.return_value = _empty_page()
        async with async_client as ac:
            response = await ac.get(
                "/commands", params={"template_id": "tmpl00000000001"}
            )
        assert response.status_code == 200
        kwargs = mock_commands_service.get_commands.call_args.kwargs
        assert kwargs["template_id"] == "tmpl00000000001"

    @pytest.mark.asyncio
    async def test_pagination_passed_through(
        self, async_client: AsyncClient, mock_commands_service: AsyncMock
    ):
        mock_commands_service.get_commands.return_value = Page(
            items=[], total=0, page=2, size=10
        )
        async with async_client as ac:
            response = await ac.get("/commands", params={"page": 2, "size": 10})
        assert response.status_code == 200
        kwargs = mock_commands_service.get_commands.call_args.kwargs
        assert kwargs["pagination"] == PaginationParams(page=2, size=10)


class TestListDeviceCommands:
    @pytest.mark.asyncio
    async def test_path_device_id_takes_precedence(
        self, async_client: AsyncClient, mock_commands_service: AsyncMock
    ):
        mock_commands_service.get_commands.return_value = _empty_page()
        async with async_client as ac:
            # A query-string device_id is ignored in favor of the path.
            response = await ac.get("/device1/commands", params={"device_id": "other"})
        assert response.status_code == 200
        kwargs = mock_commands_service.get_commands.call_args.kwargs
        assert kwargs["device_id"] == "device1"

    @pytest.mark.asyncio
    async def test_forwards_batch_id_filter(
        self, async_client: AsyncClient, mock_commands_service: AsyncMock
    ):
        mock_commands_service.get_commands.return_value = _empty_page()
        async with async_client as ac:
            response = await ac.get("/device1/commands", params={"batch_id": "grp"})
        assert response.status_code == 200
        kwargs = mock_commands_service.get_commands.call_args.kwargs
        assert kwargs["batch_id"] == "grp"
        assert kwargs["device_id"] == "device1"


# ---------------------------------------------------------------------------
# Virtual device CRUD
# ---------------------------------------------------------------------------


@pytest.fixture
def dm_with_virtual():
    return _make_dm([_PHYSICAL_DEVICE, _VIRTUAL_DEVICE])


@pytest.fixture
def virtual_app(
    dm_with_virtual, mock_ts_service, mock_commands_service, admin_token_payload
) -> FastAPI:
    app = FastAPI()
    register_exception_handlers(app)
    app.include_router(router)
    ws = MagicMock()
    ws.broadcast = AsyncMock()
    app.state.websocket_manager = ws
    app.dependency_overrides[get_device_manager] = lambda: dm_with_virtual
    app.dependency_overrides[get_ts_service] = lambda: mock_ts_service
    app.dependency_overrides[get_commands_service] = lambda: mock_commands_service
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
        dm_with_virtual.add_device.return_value = Device(
            id="new-vd",
            kind=DeviceKind.VIRTUAL,
            name="New Sensor",
            attributes={
                "co2": Attribute.create("co2", DataType.INT, {"read"}),
            },
            is_faulty=False,
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
        dm_with_virtual.update_device.return_value = Device(
            id="vd1", kind=DeviceKind.VIRTUAL, name="Renamed", is_faulty=False
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


# Device tag sub-resource


class TestDeviceTags:
    def test_set_tag_returns_updated_device(self, client: TestClient, dm: MagicMock):
        response = client.put("/device1/tags/asset_id", json={"value": "a1"})
        assert response.status_code == 200
        dm.set_device_tag.assert_called_once_with("device1", "asset_id", "a1")

    def test_set_tag_unknown_device_returns_404(
        self, client: TestClient, dm: MagicMock
    ):
        dm.set_device_tag.side_effect = NotFoundError("Device unknown not found")
        response = client.put("/unknown/tags/asset_id", json={"value": "a1"})
        assert response.status_code == 404

    def test_delete_tag_returns_204(self, client: TestClient, dm: MagicMock):
        response = client.delete("/device1/tags/asset_id")
        assert response.status_code == 204
        dm.delete_device_tag.assert_called_once_with("device1", "asset_id")

    def test_delete_tag_unknown_device_returns_404(
        self, client: TestClient, dm: MagicMock
    ):
        dm.delete_device_tag.side_effect = NotFoundError("Device unknown not found")
        response = client.delete("/unknown/tags/asset_id")
        assert response.status_code == 404
