import asyncio
import logging
import logging.config
from contextlib import asynccontextmanager
from datetime import UTC, datetime

from devices_manager import Attribute, Device, DevicesManager
from devices_manager.storage import CoreFileStorage
from fastapi import FastAPI

from api.routes import devices_router, drivers_router, transports_router
from api.routes import websocket as websocket_routes
from api.settings import load_settings
from api.websocket.manager import WebSocketManager
from api.websocket.schemas import DeviceUpdateMessage

logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    settings = load_settings()
    websocket_manager = WebSocketManager()
    app.state.websocket_manager = websocket_manager

    gridone_repository = CoreFileStorage(settings.DB_PATH)
    app.state.repository = gridone_repository
    dm = DevicesManager.from_storage(settings.DB_PATH)
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

    for device_id, device in dm.devices.items():
        try:
            await device.init_listeners()
        except Exception as e:
            logger.exception(
                "Failed to initialize listeners for device %s", device_id, exc_info=e
            )
    await dm.start_polling()
    try:
        yield
    finally:
        await dm.stop()
        await websocket_manager.close_all()


def create_app(*, logging_dict_config: dict | None = None) -> FastAPI:
    if logging_dict_config:
        logging.config.dictConfig(logging_dict_config)
    app = FastAPI(title="Gridone API", lifespan=lifespan)

    app.include_router(devices_router, prefix="/devices", tags=["devices"])
    app.include_router(transports_router, prefix="/transports", tags=["transports"])
    app.include_router(drivers_router, prefix="/drivers", tags=["drivers"])
    app.include_router(websocket_routes.router, tags=["websocket"])

    return app


app = create_app()
