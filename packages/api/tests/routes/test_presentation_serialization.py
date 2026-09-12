"""The HTTP document omits optional nulls, matching the renderer's dialect."""

from importlib import import_module
from unittest.mock import AsyncMock

import pytest
from fastapi import FastAPI
from fastapi.routing import APIRoute
from fastapi.testclient import TestClient

from api.dependencies import get_device_manager
from devices_manager import DevicesServiceInterface
from devices_manager.core.presentation.models import PresentationV1
from devices_manager.dto.presentation_dto import AvailablePresentationResponse


@pytest.mark.parametrize(
    ("resource", "prefix", "method"),
    [
        ("devices", "devices", "get_device_presentation"),
        ("drivers", "drivers", "get_driver_presentation_response"),
        ("device_groups", "devices/groups", "get_driver_presentation_response"),
    ],
)
def test_http_document_omits_nullable_model_defaults(resource, prefix, method):
    document = PresentationV1.model_validate(
        {
            "schema_version": 1,
            "requires": ["layout/1", "controls/1", "device-face/1"],
            "bindings": {"power": {"attribute": "power"}},
            "controls": {
                "power": {
                    "kind": "toggle",
                    "binding": "power",
                    "label": {"default": "Power"},
                }
            },
            "page": {
                "kind": "stack",
                "children": [
                    {"kind": "attributes"},
                    {
                        "kind": "device-face",
                        "label": {"default": "Face"},
                        "view_box": {"width": 100, "height": 100},
                        "layers": [
                            {
                                "kind": "button",
                                "box": {"x": 0, "y": 0, "width": 100, "height": 100},
                                "label": {"default": "Power"},
                                "action": {"control": "power", "op": "toggle"},
                            }
                        ],
                    },
                ],
            },
        }
    )
    dm = AsyncMock(spec=DevicesServiceInterface)
    getattr(dm, method).return_value = AvailablePresentationResponse(
        revision="r", document=document, assets={}
    )
    app = FastAPI()
    router = import_module(f"api.routes.{resource}_router").router
    # Permission wiring is covered centrally in test_authorization.py.
    for route in router.routes:
        assert isinstance(route, APIRoute)
        for dependency in route.dependencies:
            app.dependency_overrides[dependency.dependency] = lambda: None
    app.dependency_overrides[get_device_manager] = lambda: dm
    app.include_router(router, prefix=f"/{prefix}")
    with TestClient(app) as client:
        response = client.get(f"/{prefix}/example/presentation")
    assert response.status_code == 200
    children = response.json()["document"]["page"]["children"]
    assert children[0] == {"kind": "attributes"}
    button = children[1]["layers"][0]
    assert "visible_when" not in button
    assert "blocked_when" not in button
    assert button["action"] == {"control": "power", "op": "toggle"}
