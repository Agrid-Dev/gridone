# app.py
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI
from storage import CoreFileStorage

from api.routes import devices

DB_PATH = Path(__file__).parent / "../../../../.db"
gridone_repository = CoreFileStorage(DB_PATH)


@asynccontextmanager
async def lifespan(app: FastAPI):
    dm = gridone_repository.init_device_manager()
    app.state.device_manager = dm
    try:
        yield
    finally:
        for driver in dm.drivers.values():
            await driver.transport.close()


app = FastAPI(lifespan=lifespan)


def create_app(*, db_path: str | Path) -> FastAPI:
    app = FastAPI(title="Gridone API", lifespan=lifespan)

    app.include_router(devices.router, prefix="/devices", tags=["devices"])

    return app
