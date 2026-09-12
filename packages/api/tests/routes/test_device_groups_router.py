from datetime import UTC, datetime
from unittest.mock import MagicMock

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from api.auth import get_current_token_payload, get_current_user_id
from api.dependencies import get_device_manager
from api.exception_handlers import register_exception_handlers
from api.group_commands import GroupCommandPreview, GroupCommands
from api.group_references import GroupReferences
from api.routes.devices_router import router
from api.schemas.command import BatchDispatchResponse
from devices_manager import DevicesServiceInterface
from devices_manager.core.device_group import DeviceGroup
from devices_manager.core.presentation.resources import StoredResource
from models.errors import NotFoundError
from models.resource_conflict import (
    RelatedResource,
    ResourceConflictCode,
    ResourceConflictError,
)


@pytest.fixture
def context(admin_token_payload):
    group = DeviceGroup(
        id="group",
        name="East",
        driver_id="driver",
        device_ids=["device"],
        created_at=datetime.now(UTC),
        updated_at=datetime.now(UTC),
    )
    dm = MagicMock(spec=DevicesServiceInterface)
    dm.list_groups.return_value = [group]
    dm.get_group.return_value = group
    dm.create_group.return_value = group
    dm.update_group.return_value = group
    dm.get_driver_presentation_response.return_value = None
    dm.get_group_presentation_asset.return_value = StoredResource(
        b"image", "image/png", "digest", 1, 1
    )
    commands = MagicMock(spec=GroupCommands)
    commands.prepare.return_value = GroupCommandPreview(
        token="token",
        group_id="group",
        group_name="East",
        attribute="setpoint",
        value=25,
        members=[],
    )
    commands.confirm.return_value = BatchDispatchResponse(batch_id="batch", commands=[])
    references = MagicMock(spec=GroupReferences)
    references.list.return_value = []
    app = FastAPI()
    register_exception_handlers(app)
    app.include_router(router, prefix="/devices")
    app.state.group_commands = commands
    app.state.group_references = references
    app.dependency_overrides[get_device_manager] = lambda: dm
    app.dependency_overrides[get_current_token_payload] = lambda: admin_token_payload
    app.dependency_overrides[get_current_user_id] = lambda: "operator"
    return TestClient(app), dm, commands, references


def test_group_list_precedes_device_id_route(context):
    client, dm, _, _ = context
    response = client.get("/devices/groups")
    assert response.status_code == 200
    assert response.json()[0]["name"] == "East"
    dm.get_device.assert_not_called()


@pytest.mark.parametrize(
    ("method", "path", "body", "status"),
    [
        ("GET", "/devices/groups/group", None, 200),
        (
            "POST",
            "/devices/groups",
            {"name": "East", "driver_id": "driver", "device_ids": ["device"]},
            201,
        ),
        (
            "PATCH",
            "/devices/groups/group",
            {"name": "East", "device_ids": ["device"]},
            200,
        ),
        ("DELETE", "/devices/groups/group", None, 204),
        ("GET", "/devices/groups/group/references", None, 200),
        ("GET", "/devices/groups/group/presentation", None, 200),
        (
            "GET",
            "/devices/groups/group/presentation/assets/face?revision=rev",
            None,
            200,
        ),
        (
            "POST",
            "/devices/groups/group/commands/preview",
            {"attribute": "setpoint", "value": 25},
            200,
        ),
        (
            "POST",
            "/devices/groups/group/commands",
            {"token": "token", "device_ids": ["device"]},
            202,
        ),
    ],
)
def test_group_routes_delegate(context, method, path, body, status):
    client, _, _, _ = context
    assert client.request(method, path, json=body).status_code == status


def test_group_reference_conflicts_are_structured(context):
    client, dm, _, _ = context
    dm.delete_group.side_effect = ResourceConflictError(
        ResourceConflictCode.GROUP_REFERENCES,
        [RelatedResource(kind="automation", id="automation", name="Comfort")],
    )
    response = client.delete("/devices/groups/group")
    assert response.status_code == 409
    assert response.json()["detail"] == {
        "code": "group_references",
        "resources": [{"kind": "automation", "id": "automation", "name": "Comfort"}],
    }


def test_group_edit_rejects_driver_change_at_boundary(context):
    client, dm, _, _ = context
    response = client.patch(
        "/devices/groups/group",
        json={"name": "East", "device_ids": [], "driver_id": "other"},
    )
    assert response.status_code == 422
    dm.update_group.assert_not_awaited()


def test_unknown_group_returns_not_found(context):
    client, dm, _, _ = context
    dm.get_group.side_effect = NotFoundError("Group missing")
    assert client.get("/devices/groups/missing").status_code == 404
