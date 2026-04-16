from datetime import UTC, datetime
from unittest.mock import AsyncMock, MagicMock

import pytest
from commands import Command, CommandsServiceInterface
from commands.models import CommandStatus
from devices_manager import DevicesManagerInterface
from devices_manager.core.device import Attribute
from devices_manager.dto.device_dto import Device
from devices_manager.types import DataType, DeviceKind
from fastapi import FastAPI
from httpx import ASGITransport, AsyncClient

from api.dependencies import (
    get_assets_manager,
    get_commands_service,
    get_current_token_payload,
    get_current_user_id,
    get_device_manager,
)
from api.exception_handlers import register_exception_handlers
from api.routes.assets_router import router


_THERMOSTAT_A = Device(
    id="t-a",
    kind=DeviceKind.PHYSICAL,
    name="Thermostat A",
    type="thermostat",
    attributes={
        "setpoint": Attribute.create("setpoint", DataType.FLOAT, {"read", "write"}),
    },
    config={},
    driver_id="x",
    transport_id="y",
)
_THERMOSTAT_B = Device(
    id="t-b",
    kind=DeviceKind.PHYSICAL,
    name="Thermostat B",
    type="thermostat",
    attributes={
        "setpoint": Attribute.create("setpoint", DataType.FLOAT, {"read", "write"}),
    },
    config={},
    driver_id="x",
    transport_id="y",
)
_LIGHT = Device(
    id="l-1",
    kind=DeviceKind.PHYSICAL,
    name="Light",
    type="light",
    attributes={
        "power": Attribute.create("power", DataType.BOOL, {"read", "write"}),
    },
    config={},
    driver_id="x",
    transport_id="y",
)


def _make_dm() -> MagicMock:
    devices = {d.id: d for d in (_THERMOSTAT_A, _THERMOSTAT_B, _LIGHT)}

    mock = MagicMock(spec=DevicesManagerInterface)

    def _list_devices(
        *,
        ids=None,
        device_type=None,
        writable_attribute=None,
        writable_attribute_type=None,  # noqa: ARG001
    ):
        results = list(devices.values())
        if ids is not None:
            id_set = set(ids)
            results = [d for d in results if d.id in id_set]
        if device_type is not None:
            results = [d for d in results if d.type == device_type]
        if writable_attribute is not None:
            results = [
                d
                for d in results
                if writable_attribute in d.attributes
                and "write" in d.attributes[writable_attribute].read_write_modes
            ]
        return results

    mock.list_devices.side_effect = _list_devices
    return mock


@pytest.fixture
def dm():
    return _make_dm()


@pytest.fixture
def assets_manager():
    am = MagicMock()
    am.resolve_device_ids = AsyncMock(return_value=["t-a", "t-b", "l-1"])
    return am


@pytest.fixture
def mock_commands_service():
    return AsyncMock(spec=CommandsServiceInterface)


@pytest.fixture
def app(dm, assets_manager, mock_commands_service, admin_token_payload) -> FastAPI:
    app = FastAPI()
    register_exception_handlers(app)
    app.include_router(router)
    app.dependency_overrides[get_device_manager] = lambda: dm
    app.dependency_overrides[get_assets_manager] = lambda: assets_manager
    app.dependency_overrides[get_commands_service] = lambda: mock_commands_service
    app.dependency_overrides[get_current_token_payload] = lambda: admin_token_payload
    app.dependency_overrides[get_current_user_id] = lambda: admin_token_payload.sub
    return app


@pytest.fixture
def async_client(app):
    return AsyncClient(transport=ASGITransport(app=app), base_url="http://test")


def _batch_commands(group_id: str, device_ids: list[str]) -> list[Command]:
    now = datetime(2026, 1, 1, tzinfo=UTC)
    return [
        Command(
            id=i,
            group_id=group_id,
            device_id=device_id,
            attribute="setpoint",
            value=21.5,
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


class TestDispatchAssetCommand:
    @pytest.mark.asyncio
    async def test_filters_by_device_type_and_dispatches(
        self,
        async_client: AsyncClient,
        assets_manager: MagicMock,
        mock_commands_service: AsyncMock,
    ):
        mock_commands_service.dispatch_batch.return_value = _batch_commands(
            "group01", ["t-a", "t-b"]
        )
        async with async_client as ac:
            response = await ac.post(
                "/asset-1/commands",
                json={
                    "attribute": "setpoint",
                    "value": 21.5,
                    "device_type": "thermostat",
                    "recursive": True,
                },
            )
        assert response.status_code == 202
        assert response.json() == {"group_id": "group01", "total": 2}

        assets_manager.resolve_device_ids.assert_awaited_once_with(
            "asset-1", recursive=True
        )

        kwargs = mock_commands_service.dispatch_batch.call_args.kwargs
        # Only the two thermostats should be dispatched (light is excluded).
        assert sorted(kwargs["device_ids"]) == ["t-a", "t-b"]
        assert kwargs["attribute"] == "setpoint"
        assert kwargs["value"] == 21.5
        assert kwargs["data_type"] == DataType.FLOAT

    @pytest.mark.asyncio
    async def test_recursive_defaults_false(
        self,
        async_client: AsyncClient,
        assets_manager: MagicMock,
        mock_commands_service: AsyncMock,
    ):
        mock_commands_service.dispatch_batch.return_value = _batch_commands(
            "g", ["t-a", "t-b"]
        )
        async with async_client as ac:
            await ac.post(
                "/asset-1/commands",
                json={
                    "attribute": "setpoint",
                    "value": 21.5,
                    "device_type": "thermostat",
                },
            )
        assets_manager.resolve_device_ids.assert_awaited_once_with(
            "asset-1", recursive=False
        )

    @pytest.mark.asyncio
    async def test_no_devices_of_type_returns_404(
        self,
        async_client: AsyncClient,
        mock_commands_service: AsyncMock,
    ):
        async with async_client as ac:
            response = await ac.post(
                "/asset-1/commands",
                json={
                    "attribute": "power",
                    "value": True,
                    "device_type": "boiler",
                },
            )
        assert response.status_code == 404
        mock_commands_service.dispatch_batch.assert_not_awaited()

    @pytest.mark.asyncio
    async def test_unknown_asset_returns_404(
        self,
        async_client: AsyncClient,
        assets_manager: MagicMock,
    ):
        from models.errors import NotFoundError

        assets_manager.resolve_device_ids.side_effect = NotFoundError(
            "Asset 'missing' not found"
        )
        async with async_client as ac:
            response = await ac.post(
                "/missing/commands",
                json={
                    "attribute": "setpoint",
                    "value": 21.5,
                    "device_type": "thermostat",
                },
            )
        assert response.status_code == 404
