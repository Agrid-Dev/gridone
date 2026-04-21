from datetime import UTC, datetime
from unittest.mock import AsyncMock, MagicMock

import pytest
from assets.manager import AssetsManager
from assets.models import Asset, AssetType
from commands import CommandsServiceInterface, UnitCommand
from models.errors import NotFoundError
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


_ASSET_ID = "asset-1"
_CHILD_ASSET_ID = "asset-2"

_THERMOSTAT_A = Device(
    id="t-a",
    kind=DeviceKind.PHYSICAL,
    name="Thermostat A",
    type="thermostat",
    tags={"asset_id": _ASSET_ID},
    attributes={
        "setpoint": Attribute.create("setpoint", DataType.FLOAT, {"read", "write"}),
    },
    config={},
    driver_id="x",
    transport_id="y",
    is_faulty=False,
)
_THERMOSTAT_B = Device(
    id="t-b",
    kind=DeviceKind.PHYSICAL,
    name="Thermostat B",
    type="thermostat",
    tags={"asset_id": _CHILD_ASSET_ID},
    attributes={
        "setpoint": Attribute.create("setpoint", DataType.FLOAT, {"read", "write"}),
    },
    config={},
    driver_id="x",
    transport_id="y",
    is_faulty=False,
)
_LIGHT = Device(
    id="l-1",
    kind=DeviceKind.PHYSICAL,
    name="Light",
    type="light",
    tags={"asset_id": _ASSET_ID},
    attributes={
        "power": Attribute.create("power", DataType.BOOL, {"read", "write"}),
    },
    config={},
    driver_id="x",
    transport_id="y",
    is_faulty=False,
)


def _make_dm() -> MagicMock:
    devices = {d.id: d for d in (_THERMOSTAT_A, _THERMOSTAT_B, _LIGHT)}

    mock = MagicMock(spec=DevicesManagerInterface)

    def _list_devices(
        *,
        ids=None,
        types=None,
        tags=None,
        writable_attribute=None,
        writable_attribute_type=None,  # noqa: ARG001
        is_faulty=None,  # noqa: ARG001
    ):
        results = list(devices.values())
        if ids is not None:
            id_set = set(ids)
            results = [d for d in results if d.id in id_set]
        if types is not None:
            types_set = set(types)
            results = [d for d in results if d.type in types_set]
        if tags is not None:
            for key, values in tags.items():
                values_set = set(values)
                results = [d for d in results if d.tags.get(key) in values_set]
        if writable_attribute is not None:
            results = [
                d
                for d in results
                if writable_attribute in d.attributes
                and "write" in d.attributes[writable_attribute].read_write_modes
            ]
        return results

    mock.list_devices.side_effect = _list_devices
    mock.delete_device_tag = AsyncMock()
    return mock


@pytest.fixture
def dm():
    return _make_dm()


@pytest.fixture
def assets_manager():
    am = MagicMock(spec=AssetsManager)
    am.get_by_id = AsyncMock(
        return_value=Asset(
            id=_ASSET_ID, parent_id=None, type=AssetType.BUILDING, name="HQ"
        )
    )
    am.get_descendants = AsyncMock(return_value=[])
    am.get_tree = AsyncMock(return_value=[])
    am.get_tree_with_devices = AsyncMock(return_value=[])
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


def _batch_commands(batch_id: str, device_ids: list[str]) -> list[UnitCommand]:
    now = datetime(2026, 1, 1, tzinfo=UTC)
    return [
        UnitCommand(
            id=i,
            batch_id=batch_id,
            template_id=None,
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
    async def test_non_recursive_filters_by_asset_and_type(
        self,
        async_client: AsyncClient,
        mock_commands_service: AsyncMock,
    ):
        mock_commands_service.dispatch_batch.return_value = _batch_commands(
            "group01", ["t-a"]
        )
        async with async_client as ac:
            response = await ac.post(
                f"/{_ASSET_ID}/commands",
                json={
                    "attribute": "setpoint",
                    "value": 21.5,
                    "device_type": "thermostat",
                },
            )
        assert response.status_code == 202
        kwargs = mock_commands_service.dispatch_batch.call_args.kwargs
        assert kwargs["target"] == {
            "tags": {"asset_id": [_ASSET_ID]},
            "types": ["thermostat"],
        }

    @pytest.mark.asyncio
    async def test_recursive_includes_descendant_assets(
        self,
        async_client: AsyncClient,
        assets_manager: MagicMock,
        mock_commands_service: AsyncMock,
    ):
        child = Asset(
            id=_CHILD_ASSET_ID, parent_id=_ASSET_ID, type=AssetType.FLOOR, name="Floor"
        )
        assets_manager.get_descendants.return_value = [child]
        mock_commands_service.dispatch_batch.return_value = _batch_commands(
            "group01", ["t-a", "t-b"]
        )
        async with async_client as ac:
            response = await ac.post(
                f"/{_ASSET_ID}/commands",
                json={
                    "attribute": "setpoint",
                    "value": 21.5,
                    "device_type": "thermostat",
                    "recursive": True,
                },
            )
        assert response.status_code == 202
        assets_manager.get_descendants.assert_awaited_once_with(_ASSET_ID)
        kwargs = mock_commands_service.dispatch_batch.call_args.kwargs
        target = kwargs["target"]
        assert sorted(target["tags"]["asset_id"]) == sorted(
            [_ASSET_ID, _CHILD_ASSET_ID]
        )
        assert target["types"] == ["thermostat"]

    @pytest.mark.asyncio
    async def test_no_devices_of_type_returns_404(
        self,
        async_client: AsyncClient,
        mock_commands_service: AsyncMock,
    ):
        async with async_client as ac:
            response = await ac.post(
                f"/{_ASSET_ID}/commands",
                json={"attribute": "power", "value": True, "device_type": "boiler"},
            )
        # The data-type pre-validation (resolve_attribute_data_type_for_target)
        # returns 422 when no device matching the target writes the attribute,
        # before the service is invoked.
        assert response.status_code == 422
        mock_commands_service.dispatch_batch.assert_not_awaited()

    @pytest.mark.asyncio
    async def test_unknown_asset_returns_404(
        self,
        async_client: AsyncClient,
        assets_manager: MagicMock,
    ):
        assets_manager.get_by_id.side_effect = NotFoundError(
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


class TestListAssetDevices:
    @pytest.mark.asyncio
    async def test_returns_device_ids_for_asset(self, async_client: AsyncClient):
        async with async_client as ac:
            response = await ac.get(f"/{_ASSET_ID}/devices")
        assert response.status_code == 200
        assert sorted(response.json()) == ["l-1", "t-a"]

    @pytest.mark.asyncio
    async def test_unknown_asset_returns_404(
        self, async_client: AsyncClient, assets_manager: MagicMock
    ):
        assets_manager.get_by_id.side_effect = NotFoundError("not found")
        async with async_client as ac:
            response = await ac.get("/missing/devices")
        assert response.status_code == 404


class TestDeleteAsset:
    @pytest.mark.asyncio
    async def test_cleans_up_linked_device_tags(
        self, async_client: AsyncClient, assets_manager: MagicMock, dm: MagicMock
    ):
        assets_manager.delete_asset = AsyncMock()
        async with async_client as ac:
            response = await ac.delete(f"/{_ASSET_ID}")
        assert response.status_code == 204
        # Two devices are linked to _ASSET_ID (t-a and l-1)
        assert dm.delete_device_tag.await_count == 2
        called_device_ids = {
            call.args[0] for call in dm.delete_device_tag.await_args_list
        }
        assert called_device_ids == {"t-a", "l-1"}
        assets_manager.delete_asset.assert_awaited_once_with(_ASSET_ID)

    @pytest.mark.asyncio
    async def test_no_linked_devices_still_deletes(
        self, async_client: AsyncClient, assets_manager: MagicMock, dm: MagicMock
    ):
        assets_manager.delete_asset = AsyncMock()
        async with async_client as ac:
            response = await ac.delete(f"/{_CHILD_ASSET_ID}")
        assert response.status_code == 204
        # Only t-b is linked to _CHILD_ASSET_ID
        assert dm.delete_device_tag.await_count == 1
        assets_manager.delete_asset.assert_awaited_once_with(_CHILD_ASSET_ID)


class TestGetTreeWithDevices:
    @pytest.mark.asyncio
    async def test_enriches_nodes_with_linked_devices(
        self, async_client: AsyncClient, assets_manager: MagicMock
    ):
        assets_manager.get_tree.return_value = [
            {"id": _ASSET_ID, "name": "HQ", "children": []}
        ]
        async with async_client as ac:
            response = await ac.get("/tree-with-devices")
        assert response.status_code == 200
        node = response.json()[0]
        assert node["id"] == _ASSET_ID
        linked = {d["id"] for d in node["devices"]}
        assert linked == {"t-a", "l-1"}

    @pytest.mark.asyncio
    async def test_device_without_asset_tag_not_linked(
        self, async_client: AsyncClient, assets_manager: MagicMock
    ):
        assets_manager.get_tree.return_value = [
            {"id": _ASSET_ID, "name": "HQ", "children": []}
        ]
        async with async_client as ac:
            response = await ac.get("/tree-with-devices")
        node = response.json()[0]
        linked_ids = {d["id"] for d in node["devices"]}
        # t-b is linked to _CHILD_ASSET_ID, not _ASSET_ID
        assert "t-b" not in linked_ids
