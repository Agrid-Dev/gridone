from datetime import UTC, datetime
from unittest.mock import AsyncMock, MagicMock

import pytest
from fastapi import FastAPI
from httpx import ASGITransport, AsyncClient

from api.dependencies import (
    get_assets_service,
    get_commands_service,
    get_current_token_payload,
    get_current_user_id,
    get_device_manager,
)
from api.exception_handlers import register_exception_handlers
from api.routes.assets_router import router
from assets import AssetsService
from assets.models import (
    Asset,
    AssetType,
    BuildingModel,
    BuildingModelStatus,
    BuildingProfile,
    ModelSpace,
    ModelStorey,
    TreeImportResult,
)
from commands import BatchCommandDispatch, CommandsServiceInterface, UnitCommand
from commands.models import CommandStatus
from devices_manager import DevicesServiceInterface
from devices_manager.core.device import Attribute
from devices_manager.dto.device_dto import Device
from devices_manager.types import DataType
from models.errors import InvalidError, NotFoundError
from models.targets import DevicesFilter

_ASSET_ID = "asset-1"
_CHILD_ASSET_ID = "asset-2"

_BUILDING_MODEL = BuildingModel(
    asset_id=_ASSET_ID,
    status=BuildingModelStatus.READY,
    filename="hq.ifc",
    ifc_size=1234,
    glb_size=567,
    storeys=[ModelStorey(global_id="s1", name="Level 0", elevation=0.0)],
    spaces=[
        ModelSpace(
            global_id="sp1",
            name="Room 001",
            storey_global_id="s1",
            storey_name="Level 0",
        )
    ],
    created_at=datetime(2026, 1, 1, tzinfo=UTC),
    updated_at=datetime(2026, 1, 2, tzinfo=UTC),
)
_MODEL_ETAG = f'"{_ASSET_ID}-{int(_BUILDING_MODEL.updated_at.timestamp())}"'

_THERMOSTAT_A = Device(
    id="t-a",
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

    mock = MagicMock(spec=DevicesServiceInterface)

    def _list_devices(
        *,
        ids=None,
        types=None,
        tags=None,
        writable_attribute=None,
        **_kwargs: object,
    ) -> list[Device]:
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
def assets_service():
    svc = MagicMock(spec=AssetsService)
    svc.get_by_id = AsyncMock(
        return_value=Asset(
            id=_ASSET_ID, parent_id=None, type=AssetType.BUILDING, name="HQ"
        )
    )
    svc.get_descendants = AsyncMock(return_value=[])
    svc.get_profile = AsyncMock(return_value=BuildingProfile())
    svc.set_profile = AsyncMock(side_effect=lambda profile: profile)
    svc.get_tree = AsyncMock(return_value=[])
    svc.get_tree_with_devices = AsyncMock(return_value=[])
    svc.list_all = AsyncMock(return_value=[])
    svc.upload_model = AsyncMock(
        return_value=_BUILDING_MODEL.model_copy(
            update={"status": BuildingModelStatus.PROCESSING, "glb_size": None}
        )
    )
    svc.get_model = AsyncMock(return_value=_BUILDING_MODEL)
    svc.get_model_glb = AsyncMock(return_value=b"glTF-binary-payload")
    svc.get_model_spaces = AsyncMock(return_value=_BUILDING_MODEL.spaces)
    svc.delete_model = AsyncMock()
    svc.import_tree = AsyncMock(
        return_value=TreeImportResult(floors_created=2, rooms_created=10)
    )
    return svc


@pytest.fixture
def mock_commands_service():
    return AsyncMock(spec=CommandsServiceInterface)


@pytest.fixture
def app(dm, assets_service, mock_commands_service, admin_token_payload) -> FastAPI:
    app = FastAPI()
    register_exception_handlers(app)
    app.include_router(router)
    app.dependency_overrides[get_device_manager] = lambda: dm
    app.dependency_overrides[get_assets_service] = lambda: assets_service
    app.dependency_overrides[get_commands_service] = lambda: mock_commands_service
    app.dependency_overrides[get_current_token_payload] = lambda: admin_token_payload
    app.dependency_overrides[get_current_user_id] = lambda: admin_token_payload.sub
    return app


@pytest.fixture
def async_client(app):
    return AsyncClient(transport=ASGITransport(app=app), base_url="http://test")


def _batch_dispatch(batch_id: str, device_ids: list[str]) -> BatchCommandDispatch:
    now = datetime(2026, 1, 1, tzinfo=UTC)
    return BatchCommandDispatch(
        batch_id=batch_id,
        commands=[
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
        ],
    )


class TestDispatchAssetCommand:
    @pytest.mark.asyncio
    async def test_non_recursive_filters_by_asset_and_type(
        self,
        async_client: AsyncClient,
        mock_commands_service: AsyncMock,
    ):
        mock_commands_service.dispatch_batch.return_value = _batch_dispatch(
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
        assert kwargs["target"] == DevicesFilter(
            tags={"asset_id": [_ASSET_ID]},
            types=["thermostat"],
        )

    @pytest.mark.asyncio
    async def test_recursive_includes_descendant_assets(
        self,
        async_client: AsyncClient,
        assets_service: MagicMock,
        mock_commands_service: AsyncMock,
    ):
        child = Asset(
            id=_CHILD_ASSET_ID, parent_id=_ASSET_ID, type=AssetType.FLOOR, name="Floor"
        )
        assets_service.get_descendants.return_value = [child]
        mock_commands_service.dispatch_batch.return_value = _batch_dispatch(
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
        assets_service.get_descendants.assert_awaited_once_with(_ASSET_ID)
        kwargs = mock_commands_service.dispatch_batch.call_args.kwargs
        target = kwargs["target"]
        assert sorted((target.tags or {})["asset_id"]) == sorted(
            [_ASSET_ID, _CHILD_ASSET_ID]
        )
        assert target.types == ["thermostat"]

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
        assets_service: MagicMock,
    ):
        assets_service.get_by_id.side_effect = NotFoundError(
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
        self, async_client: AsyncClient, assets_service: MagicMock
    ):
        assets_service.get_by_id.side_effect = NotFoundError("not found")
        async with async_client as ac:
            response = await ac.get("/missing/devices")
        assert response.status_code == 404


class TestDeleteAsset:
    @pytest.mark.asyncio
    async def test_cleans_up_linked_device_tags(
        self, async_client: AsyncClient, assets_service: MagicMock, dm: MagicMock
    ):
        assets_service.delete_asset = AsyncMock()
        async with async_client as ac:
            response = await ac.delete(f"/{_ASSET_ID}")
        assert response.status_code == 204
        # Two devices are linked to _ASSET_ID (t-a and l-1)
        assert dm.delete_device_tag.await_count == 2
        called_device_ids = {
            call.args[0] for call in dm.delete_device_tag.await_args_list
        }
        assert called_device_ids == {"t-a", "l-1"}
        assets_service.delete_asset.assert_awaited_once_with(_ASSET_ID)

    @pytest.mark.asyncio
    async def test_no_linked_devices_still_deletes(
        self, async_client: AsyncClient, assets_service: MagicMock, dm: MagicMock
    ):
        assets_service.delete_asset = AsyncMock()
        async with async_client as ac:
            response = await ac.delete(f"/{_CHILD_ASSET_ID}")
        assert response.status_code == 204
        # Only t-b is linked to _CHILD_ASSET_ID
        assert dm.delete_device_tag.await_count == 1
        assets_service.delete_asset.assert_awaited_once_with(_CHILD_ASSET_ID)


class TestGetTreeWithDevices:
    @pytest.mark.asyncio
    async def test_enriches_nodes_with_linked_devices(
        self, async_client: AsyncClient, assets_service: MagicMock
    ):
        assets_service.get_tree.return_value = [
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
        self, async_client: AsyncClient, assets_service: MagicMock
    ):
        assets_service.get_tree.return_value = [
            {"id": _ASSET_ID, "name": "HQ", "children": []}
        ]
        async with async_client as ac:
            response = await ac.get("/tree-with-devices")
        node = response.json()[0]
        linked_ids = {d["id"] for d in node["devices"]}
        # t-b is linked to _CHILD_ASSET_ID, not _ASSET_ID
        assert "t-b" not in linked_ids


class TestListAssets:
    @pytest.mark.asyncio
    async def test_returns_assets(
        self, async_client: AsyncClient, assets_service: MagicMock
    ):
        hq = Asset(id=_ASSET_ID, parent_id=None, type=AssetType.BUILDING, name="HQ")
        assets_service.list_all.return_value = [hq]
        async with async_client as ac:
            response = await ac.get("/")
        assert response.status_code == 200
        assert response.json()[0]["id"] == _ASSET_ID

    @pytest.mark.asyncio
    async def test_type_query_param_forwarded_as_asset_type(
        self, async_client: AsyncClient, assets_service: MagicMock
    ):
        assets_service.list_all.return_value = []
        async with async_client as ac:
            response = await ac.get("/?type=floor")
        assert response.status_code == 200
        assets_service.list_all.assert_awaited_once_with(
            parent_id=None, asset_type="floor"
        )


class TestBuildingProfile:
    @pytest.mark.asyncio
    async def test_get_returns_profile(
        self, async_client: AsyncClient, assets_service: MagicMock
    ):
        assets_service.get_profile.return_value = BuildingProfile(name="HQ", floors=3)
        async with async_client as ac:
            response = await ac.get("/profile")
        assert response.status_code == 200
        assert response.json()["name"] == "HQ"
        assert response.json()["floors"] == 3

    @pytest.mark.asyncio
    async def test_put_upserts_and_returns_profile(
        self, async_client: AsyncClient, assets_service: MagicMock
    ):
        async with async_client as ac:
            response = await ac.put("/profile", json={"name": "HQ", "latitude": 48.85})
        assert response.status_code == 200
        assert response.json()["name"] == "HQ"
        assets_service.set_profile.assert_awaited_once()

    @pytest.mark.asyncio
    async def test_put_invalid_value_is_rejected_and_changes_nothing(
        self, async_client: AsyncClient, assets_service: MagicMock
    ):
        async with async_client as ac:
            response = await ac.put("/profile", json={"latitude": 200})
        assert response.status_code == 422
        assets_service.set_profile.assert_not_awaited()

    @pytest.mark.asyncio
    async def test_get_profile_schema(self, async_client: AsyncClient):
        async with async_client as ac:
            response = await ac.get("/profile/schema")
        assert response.status_code == 200
        assert "latitude" in response.json()["properties"]


class TestUploadBuildingModel:
    @pytest.mark.asyncio
    async def test_multipart_upload_returns_202(
        self, async_client: AsyncClient, assets_service: MagicMock
    ):
        async with async_client as ac:
            response = await ac.post(
                f"/{_ASSET_ID}/model",
                files={"file": ("hq.ifc", b"ifc-bytes", "application/octet-stream")},
            )
        assert response.status_code == 202
        assert response.json()["status"] == "processing"
        assets_service.upload_model.assert_awaited_once_with(
            _ASSET_ID, filename="hq.ifc", data=b"ifc-bytes"
        )

    @pytest.mark.asyncio
    async def test_upload_on_non_building_is_422(
        self, async_client: AsyncClient, assets_service: MagicMock
    ):
        assets_service.upload_model.side_effect = InvalidError("not a building")
        async with async_client as ac:
            response = await ac.post(
                f"/{_ASSET_ID}/model", files={"file": ("x.ifc", b"data")}
            )
        assert response.status_code == 422

    @pytest.mark.asyncio
    async def test_upload_on_missing_asset_is_404(
        self, async_client: AsyncClient, assets_service: MagicMock
    ):
        assets_service.upload_model.side_effect = NotFoundError("nope")
        async with async_client as ac:
            response = await ac.post(
                "/missing/model", files={"file": ("x.ifc", b"data")}
            )
        assert response.status_code == 404


class TestGetBuildingModel:
    @pytest.mark.asyncio
    async def test_returns_metadata(
        self, async_client: AsyncClient, assets_service: MagicMock
    ):
        async with async_client as ac:
            response = await ac.get(f"/{_ASSET_ID}/model")
        assert response.status_code == 200
        body = response.json()
        assert body["status"] == "ready"
        assert body["filename"] == "hq.ifc"
        assert body["glb_size"] == 567
        assert body["spaces"][0]["global_id"] == "sp1"
        assets_service.get_model.assert_awaited_once_with(_ASSET_ID)

    @pytest.mark.asyncio
    async def test_missing_model_is_404(
        self, async_client: AsyncClient, assets_service: MagicMock
    ):
        assets_service.get_model.side_effect = NotFoundError("no model")
        async with async_client as ac:
            response = await ac.get(f"/{_ASSET_ID}/model")
        assert response.status_code == 404


class TestGetBuildingModelScene:
    @pytest.mark.asyncio
    async def test_serves_binary_with_etag_and_caching(self, async_client: AsyncClient):
        async with async_client as ac:
            response = await ac.get(f"/{_ASSET_ID}/model/scene.glb")
        assert response.status_code == 200
        assert response.content == b"glTF-binary-payload"
        assert response.headers["content-type"] == "model/gltf-binary"
        assert response.headers["etag"] == _MODEL_ETAG
        assert "immutable" in response.headers["cache-control"]

    @pytest.mark.asyncio
    async def test_matching_if_none_match_short_circuits_to_304(
        self, async_client: AsyncClient, assets_service: MagicMock
    ):
        async with async_client as ac:
            response = await ac.get(
                f"/{_ASSET_ID}/model/scene.glb",
                headers={"If-None-Match": _MODEL_ETAG},
            )
        assert response.status_code == 304
        assert response.headers["etag"] == _MODEL_ETAG
        assets_service.get_model_glb.assert_not_awaited()

    @pytest.mark.asyncio
    async def test_stale_if_none_match_returns_fresh_body(
        self, async_client: AsyncClient
    ):
        async with async_client as ac:
            response = await ac.get(
                f"/{_ASSET_ID}/model/scene.glb",
                headers={"If-None-Match": '"stale-etag"'},
            )
        assert response.status_code == 200
        assert response.content == b"glTF-binary-payload"


class TestListBuildingModelSpaces:
    @pytest.mark.asyncio
    async def test_returns_spaces(self, async_client: AsyncClient):
        async with async_client as ac:
            response = await ac.get(f"/{_ASSET_ID}/model/spaces")
        assert response.status_code == 200
        assert response.json() == [
            {
                "global_id": "sp1",
                "name": "Room 001",
                "storey_global_id": "s1",
                "storey_name": "Level 0",
            }
        ]


class TestDeleteBuildingModel:
    @pytest.mark.asyncio
    async def test_delete_returns_204(
        self, async_client: AsyncClient, assets_service: MagicMock
    ):
        async with async_client as ac:
            response = await ac.delete(f"/{_ASSET_ID}/model")
        assert response.status_code == 204
        assets_service.delete_model.assert_awaited_once_with(_ASSET_ID)

    @pytest.mark.asyncio
    async def test_delete_missing_model_is_404(
        self, async_client: AsyncClient, assets_service: MagicMock
    ):
        assets_service.delete_model.side_effect = NotFoundError("no model")
        async with async_client as ac:
            response = await ac.delete(f"/{_ASSET_ID}/model")
        assert response.status_code == 404


class TestImportBuildingModelTree:
    @pytest.mark.asyncio
    async def test_unlinks_devices_of_replaced_subtree(
        self, async_client: AsyncClient, assets_service: MagicMock, dm: MagicMock
    ):
        assets_service.get_descendants.return_value = [
            Asset(
                id=_CHILD_ASSET_ID,
                parent_id=_ASSET_ID,
                type=AssetType.FLOOR,
                name="F1",
            )
        ]
        async with async_client as ac:
            response = await ac.post(f"/{_ASSET_ID}/model/import-tree")
        assert response.status_code == 200
        assert response.json() == {
            "floors_created": 2,
            "rooms_created": 10,
            "devices_unlinked": 1,
        }
        # Only thermostat B is linked to the replaced child asset.
        dm.delete_device_tag.assert_awaited_once_with("t-b", "asset_id")

    @pytest.mark.asyncio
    async def test_empty_subtree_unlinks_nothing(
        self, async_client: AsyncClient, assets_service: MagicMock, dm: MagicMock
    ):
        assets_service.get_descendants.return_value = []
        async with async_client as ac:
            response = await ac.post(f"/{_ASSET_ID}/model/import-tree")
        assert response.status_code == 200
        assert response.json()["devices_unlinked"] == 0
        dm.delete_device_tag.assert_not_awaited()

    @pytest.mark.asyncio
    async def test_failed_import_preserves_device_links(
        self, async_client: AsyncClient, assets_service: MagicMock, dm: MagicMock
    ):
        assets_service.get_descendants.return_value = [
            Asset(
                id=_CHILD_ASSET_ID,
                parent_id=_ASSET_ID,
                type=AssetType.FLOOR,
                name="F1",
            )
        ]
        assets_service.import_tree.side_effect = InvalidError("not ready")
        async with async_client as ac:
            response = await ac.post(f"/{_ASSET_ID}/model/import-tree")
        assert response.status_code == 422
        dm.delete_device_tag.assert_not_awaited()
