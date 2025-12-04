from fastapi import FastAPI

from api.routes import devices


def create_app() -> FastAPI:
    app = FastAPI(title="Gridone API")

    app.include_router(devices.router, prefix="/devices", tags=["devices"])

    return app
