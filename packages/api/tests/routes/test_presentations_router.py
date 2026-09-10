from dataclasses import asdict

from fastapi import FastAPI
from fastapi.testclient import TestClient

from api.auth import get_current_token_payload
from api.routes.presentations_router import router
from devices_manager.core.presentation.capabilities import (
    DOCUMENT_BUDGETS,
    SUPPORTED_CAPABILITIES,
    SUPPORTED_SCHEMA_VERSIONS,
)
from devices_manager.core.presentation.models import PresentationV1
from devices_manager.core.presentation.package import DEFAULT_PACKAGE_LIMITS
from devices_manager.core.presentation.resource import DEFAULT_IMAGE_LIMITS
from models.yaml_loader import DEFAULT_YAML_LIMITS


def test_schema_exposes_the_importers_actual_contract(admin_token_payload):
    app = FastAPI()
    app.include_router(router, prefix="/presentations")
    app.dependency_overrides[get_current_token_payload] = lambda: admin_token_payload
    with TestClient(app) as client:
        response = client.get("/presentations/schema")
    assert response.status_code == 200
    assert response.json() == {
        "versions": sorted(SUPPORTED_SCHEMA_VERSIONS),
        "capabilities": sorted(SUPPORTED_CAPABILITIES),
        "budgets": {
            "document": asdict(DOCUMENT_BUDGETS),
            "package": asdict(DEFAULT_PACKAGE_LIMITS),
            "images": asdict(DEFAULT_IMAGE_LIMITS),
            "yaml": asdict(DEFAULT_YAML_LIMITS),
        },
        "json_schema": PresentationV1.model_json_schema(),
    }
