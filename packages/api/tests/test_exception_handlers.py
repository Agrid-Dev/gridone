from fastapi import FastAPI
from fastapi.testclient import TestClient

from api.exception_handlers import register_exception_handlers
from models.errors import ForbiddenError


def test_forbidden_error_renders_403_with_its_message():
    app = FastAPI()
    register_exception_handlers(app)

    @app.get("/")
    async def route() -> None:
        msg = "Attribute 'fan_speed' is not commandable"
        raise ForbiddenError(msg)

    resp = TestClient(app).get("/")

    assert resp.status_code == 403
    assert resp.json() == {"detail": "Attribute 'fan_speed' is not commandable"}
