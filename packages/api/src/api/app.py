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
                # Get transport_config from existing device
                try:
                    existing_device_raw = gridone_repository.devices.read(device_with_driver.id)
                    transport_config_name = existing_device_raw.get("transport_config")
                except Exception as e:
                    logger.warning(
                        "Could not read transport_config from existing device: %s",
                        e,
                    )
                    transport_config_name = None
                
                # Fallback: use first available transport_config
                if not transport_config_name:
                    transport_configs = gridone_repository.transport_configs.read_all()
                    if transport_configs:
                        transport_config_name = transport_configs[0].get("name")
                
                if not transport_config_name:
                    logger.warning(
                        "Could not determine transport_config for driver '%s', skipping discovery",
                        driver_name,
                    )
                    continue
                
                # Create discovery callback that captures driver_name and transport_config_name
                def make_discovery_callback(drv_name: str, t_config_name: str):
                    def save_discovered_device(
                        device_id: str,
                        device_config: dict,
                        discovered_attributes: dict,
                    ) -> None:
                        """Save a discovered device to storage and load it."""
                        # Create device raw data
                        device_raw = {
                            "id": device_id,
                            "driver": drv_name,
                            "transport_config": t_config_name,
                            "config": device_config,
                        }

                        # Check if device already exists
                        try:
                            gridone_repository.devices.read(device_id)
                            logger.info(
                                "Device '%s' already exists, skipping discovery save",
                                device_id,
                            )
                            return
                        except Exception:
                            # Device doesn't exist, save it
                            pass

                        # Save device to storage
                        try:
                            gridone_repository.devices.write(device_id, device_raw)
                            logger.info(
                                "Saved discovered device '%s' (driver: %s, "
                                "transport_config: %s)",
                                device_id,
                                drv_name,
                                t_config_name,
                            )
                        except Exception as e:
                            logger.error(
                                "Failed to save discovered device '%s': %s",
                                device_id,
                                e,
                                exc_info=True,
                            )
                            return

                        # Load and register the device in the running system
                        try:
                            # Get all drivers and transport configs for the add_device method
                            drivers_raw = gridone_repository.drivers.read_all()
                            transport_configs = (
                                gridone_repository.transport_configs.read_all()
                            )

                            # Add device to the running DevicesManager with initial attributes
                            dm.add_device(
                                device_raw,
                                drivers_raw,
                                transport_configs,
                                initial_attributes=discovered_attributes,
                            )

                            logger.info(
                                "Successfully loaded and registered discovered device '%s' "
                                "with %d initial attributes",
                                device_id,
                                len(discovered_attributes),
                            )
                        except Exception as e:
                            logger.error(
                                "Failed to load discovered device '%s' into "
                                "DevicesManager: %s",
                                device_id,
                                e,
                                exc_info=True,
                            )

                    return save_discovered_device
                
                # Set discovery callback
                driver.set_discovery_callback(
                    make_discovery_callback(driver_name, transport_config_name)
                )
                
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
