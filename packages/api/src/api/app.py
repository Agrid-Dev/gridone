import asyncio
import logging
import logging.config
from contextlib import asynccontextmanager
from datetime import UTC, datetime

from core.attribute import Attribute
from core.device import Device
from fastapi import FastAPI
from storage import CoreFileStorage

from api.routes import devices
from api.routes import websocket as websocket_routes
from api.settings import settings
from api.websocket.manager import WebSocketManager
from api.websocket.schemas import DeviceUpdateMessage

logger = logging.getLogger(__name__)

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

    await asyncio.gather(*[d.init_listeners() for d in dm.devices.values()])
        
    dm.add_device_attribute_listener(broadcast_attribute_update)
        # Start discovery for drivers that have discovery configured
    for driver_name, driver in dm.drivers.items():
        print(f"Driver: {driver_name} discovery: {driver.schema.discovery}")
        if driver.schema.discovery:
            # Find a device using this driver to get the config (needed for templating)
            device_with_driver = next(
                (d for d in dm.devices.values() if d.driver.name == driver_name),
                None
            )
            if device_with_driver:
                try:
                    driver.start_discovery(device_with_driver.config)
                except Exception as e:
                    logger.error(f"Failed to start discovery for driver '{driver_name}': {e}", exc_info=True)
            else:
                logger.warning(f"No device found for driver '{driver_name}', cannot start discovery")
    

    
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
