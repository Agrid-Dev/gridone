from cors import configure_cors
from fastapi import FastAPI
from fastapi.testclient import TestClient

_ALLOWED_ORIGIN = "http://localhost:5173"


def _make_app() -> FastAPI:
    app = FastAPI()

    @app.get("/protected")
    def protected() -> dict[str, str]:
        return {"status": "ok"}

    configure_cors(app)
    return app


def test_www_authenticate_is_exposed_cross_origin() -> None:
    """Browsers strip response headers cross-origin unless CORS lists them.

    The SDK reads WWW-Authenticate to tell an expired token apart from a bad
    password; without this exposure a cross-origin caller never sees it.
    """
    with TestClient(_make_app()) as client:
        resp = client.get("/protected", headers={"Origin": _ALLOWED_ORIGIN})

    exposed = resp.headers.get("access-control-expose-headers", "")
    assert "WWW-Authenticate" in exposed
