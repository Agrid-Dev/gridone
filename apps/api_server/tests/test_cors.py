from fastapi import FastAPI
from fastapi.testclient import TestClient
from main import CORS_EXPOSE_HEADERS, configure_cors

_ALLOWED_ORIGIN = "http://localhost:5173"


def _make_app() -> FastAPI:
    app = FastAPI()

    @app.get("/protected")
    def protected() -> dict[str, str]:
        return {"status": "ok"}

    configure_cors(app)
    return app


def test_www_authenticate_is_exposed_cross_origin() -> None:
    """A browser strips response headers cross-origin unless CORS lists them.

    The SDK's refresh logic reads WWW-Authenticate to tell an expired token
    apart from a bad password (see httpClient.ts); without this exposure a
    cross-origin caller (e.g. the Vite dev server) never sees it.
    """
    assert "WWW-Authenticate" in CORS_EXPOSE_HEADERS

    with TestClient(_make_app()) as client:
        resp = client.get("/protected", headers={"Origin": _ALLOWED_ORIGIN})

    exposed = resp.headers.get("access-control-expose-headers", "")
    assert "WWW-Authenticate" in exposed
