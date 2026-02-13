import asyncio
import logging
import logging.config
from contextlib import asynccontextmanager
from datetime import UTC, datetime

from devices_manager import Attribute, Device, DevicesManager
from fastapi import FastAPI
from gridone_storage import PostgresConnectionManager

from api.exception_handlers import register_exception_handlers
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
    postgres_connection_manager = PostgresConnectionManager(settings.DATABASE_URL)
    app.state.postgres_connection_manager = postgres_connection_manager

    dm = await DevicesManager.from_postgres(postgres_connection_manager)
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
        await dm.stop()
        await websocket_manager.close_all()
        await postgres_connection_manager.close()


def create_app(*, logging_dict_config: dict | None = None) -> FastAPI:
    if logging_dict_config:
        logging.config.dictConfig(logging_dict_config)
    app = FastAPI(title="Gridone API", lifespan=lifespan)
    register_exception_handlers(app)

    app.include_router(devices_router, prefix="/devices", tags=["devices"])
    app.include_router(transports_router, prefix="/transports", tags=["transports"])
    app.include_router(drivers_router, prefix="/drivers", tags=["drivers"])
    app.include_router(websocket_routes.router, tags=["websocket"])

    return app


app = create_app()
