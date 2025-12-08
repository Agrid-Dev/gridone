# app.py
from contextlib import asynccontextmanager

from fastapi import FastAPI
from storage import CoreFileStorage

from api.routes import devices
from api.settings import settings


@asynccontextmanager
async def lifespan(app: FastAPI):
    gridone_repository = CoreFileStorage(settings.DB_PATH)
    dm = gridone_repository.init_device_manager()
    app.state.device_manager = dm
    try:
        yield
    finally:
        for driver in dm.drivers.values():
            await driver.transport.close()


app = FastAPI(lifespan=lifespan)


def create_app() -> FastAPI:
    app = FastAPI(title="Gridone API", lifespan=lifespan)

    app.include_router(devices.router, prefix="/devices", tags=["devices"])

    return app
