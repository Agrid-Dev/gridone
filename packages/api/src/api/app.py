from pathlib import Path

from fastapi import FastAPI
from storage import CoreFileStorage

from api.routes import devices


def create_app(*, db_path: str | Path) -> FastAPI:
    app = FastAPI(title="Gridone API")

    gridone_repository = CoreFileStorage(db_path)
    device_manager = gridone_repository.init_device_manager()

    app.state.device_manager = device_manager

    app.include_router(devices.router, prefix="/devices", tags=["devices"])

    return app
