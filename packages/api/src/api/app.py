import asyncio
import logging.config
from contextlib import asynccontextmanager
from datetime import UTC, datetime

from fastapi import FastAPI
from core.attribute import Attribute
from core.device import Device
from storage import CoreFileStorage

from api.routes import devices
from api.routes import websocket as websocket_routes
from api.settings import settings
from api.websocket.manager import WebSocketManager
from api.websocket.schemas import DeviceUpdateMessage


@asynccontextmanager
async def lifespan(app: FastAPI):
    websocket_manager = WebSocketManager()
    app.state.websocket_manager = websocket_manager

    gridone_repository = CoreFileStorage(settings.DB_PATH)
    dm = gridone_repository.init_device_manager()
    app.state.device_manager = dm

    def broadcast_attribute_update(
        device: Device, attribute_name: str, attribute: Attribute
    ) -> None:
        message = DeviceUpdateMessage(
            device_id=device.id,
            attribute=attribute_name,
            value=attribute.current_value,
            timestamp=attribute.last_updated or datetime.now(UTC),
        )
        asyncio.create_task(websocket_manager.broadcast(message))

    dm.add_device_attribute_listener(broadcast_attribute_update)
    await dm.start_polling()
    try:
        yield
    finally:
        await dm.stop_polling()
        await websocket_manager.close_all()
        for driver in dm.drivers.values():
            await driver.transport.close()


def create_app(*, logging_dict_config: dict | None = None) -> FastAPI:
    if logging_dict_config:
        logging.config.dictConfig(logging_dict_config)
    app = FastAPI(title="Gridone API", lifespan=lifespan)

    app.include_router(devices.router, prefix="/devices", tags=["devices"])
    app.include_router(websocket_routes.router, tags=["websocket"])

    return app


app = create_app()
