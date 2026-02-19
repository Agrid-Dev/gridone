import logging
import logging.config
from contextlib import asynccontextmanager
from datetime import UTC, datetime

from devices_manager import Attribute, Device, DevicesManager
from fastapi import Depends, FastAPI
from timeseries import DataPoint, SeriesKey, create_service

from users.auth import get_current_user_id
from api.exception_handlers import register_exception_handlers
from api.routes import (
    devices_router,
    drivers_router,
    timeseries_router,
    transports_router,
)
from api.routes import websocket as websocket_routes
from api.routes.users import auth_router, users_router
from api.settings import load_settings
from api.websocket.manager import WebSocketManager
from api.websocket.schemas import DeviceUpdateMessage
from users import UsersManager
from users.storage import build_users_storage

logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    settings = load_settings()
    websocket_manager = WebSocketManager()
    app.state.websocket_manager = websocket_manager

    dm = await DevicesManager.from_storage(settings.storage_url)
    ts_service = await create_service()
    app.state.device_manager = dm
    app.state.ts_service = ts_service

    users_storage = await build_users_storage(settings.storage_url)
    um = UsersManager(users_storage)
    await um.ensure_default_admin()
    app.state.users_manager = um

    async def on_attribute_update(
        device: Device, attribute_name: str, attribute: Attribute
    ) -> None:
        """On device attribute update:
        - broadcast to websocket
        - store in time series
        """
        message = DeviceUpdateMessage(
            device_id=device.id,
            attribute=attribute_name,
            value=attribute.current_value,
            timestamp=attribute.last_updated or datetime.now(UTC),
        )
        await websocket_manager.broadcast(message)
        await ts_service.upsert_points(
            SeriesKey(owner_id=device.id, metric=attribute_name),
            [
                DataPoint(
                    timestamp=attribute.last_changed or datetime.now(UTC),
                    value=attribute.current_value,  # ty: ignore[invalid-argument-type]
                )
            ],
            create_if_not_found=True,
        )

    dm.add_device_attribute_listener(on_attribute_update)

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
    register_exception_handlers(app)

    # Public routes (no JWT required)
    app.include_router(auth_router, prefix="/auth", tags=["auth"])

    # Protected routes (JWT required)
    jwt_dep = [Depends(get_current_user_id)]
    app.include_router(users_router, prefix="/users", tags=["users"], dependencies=jwt_dep)
    app.include_router(devices_router, prefix="/devices", tags=["devices"], dependencies=jwt_dep)
    app.include_router(transports_router, prefix="/transports", tags=["transports"], dependencies=jwt_dep)
    app.include_router(drivers_router, prefix="/drivers", tags=["drivers"], dependencies=jwt_dep)
    app.include_router(timeseries_router, prefix="/timeseries", tags=["timeseries"], dependencies=jwt_dep)
    app.include_router(websocket_routes.router, tags=["websocket"])

    return app


app = create_app()
