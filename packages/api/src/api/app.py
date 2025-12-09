import logging.config
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
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

    # Configure CORS
    app.add_middleware(
        CORSMiddleware,
        allow_origins=[
            "http://localhost:5173",  # Vite dev server (default port)
            "http://localhost:5174",  # Vite dev server (alternative port)
        ],
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    app.include_router(devices.router, prefix="/devices", tags=["devices"])

    return app
