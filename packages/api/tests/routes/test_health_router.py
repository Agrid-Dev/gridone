import os
from unittest.mock import patch

from fastapi import FastAPI
from fastapi.testclient import TestClient

from api.routes.health_router import router

app = FastAPI()
app.include_router(router, prefix="/health")
client = TestClient(app)


def test_health_returns_ok():
    response = client.get("/health")

    assert response.status_code == 200
    body = response.json()
    assert body["status"] == "ok"
    assert body["version"] is None


def test_health_returns_version_from_env():
    with patch.dict(os.environ, {"GRIDONE_VERSION": "1.2.3"}):
        response = client.get("/health")

    assert response.status_code == 200
    assert response.json()["version"] == "1.2.3"


def test_health_requires_no_authentication():
    response = client.get("/health")

    assert response.status_code == 200
