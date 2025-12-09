import logging.config
from contextlib import asynccontextmanager

from fastapi import FastAPI
from storage import CoreFileStorage

from api.routes import devices
from api.settings import settings


@asynccontextmanager
async def lifespan(app: FastAPI):
    gridone_repository = CoreFileStorage(settings.DB_PATH)
    dm = gridone_repository.init_device_manager()
    await dm.start_polling()
    app.state.device_manager = dm
    try:
        yield
    finally:
        await dm.stop_polling()
        for driver in dm.drivers.values():
            await driver.transport.close()


app = FastAPI(lifespan=lifespan)


def create_app(*, logging_dict_config: dict | None = None) -> FastAPI:
    if logging_dict_config:
        logging.config.dictConfig(logging_dict_config)
    app = FastAPI(title="Gridone API", lifespan=lifespan)

    app.include_router(devices.router, prefix="/devices", tags=["devices"])

    return app
