import logging
import logging.config
from contextlib import asynccontextmanager
from datetime import UTC, datetime

from apps import AppsService
from assets import AssetsManager
from devices_manager import Attribute, Device, DevicesManager
from fastapi import Depends, FastAPI
from timeseries import DataPoint, SeriesKey, create_service
from users import UsersManager
from users.auth import AuthService

from api.dependencies import get_current_user_id
from api.exception_handlers import register_exception_handlers
from api.routes import (
    assets_router,
    devices_router,
    drivers_router,
    health_router,
    timeseries_router,
    transports_router,
)
from api.routes import websocket as websocket_routes
from api.routes.apps import apps_registration_router, apps_router
from api.routes.users import auth_router, users_router
from api.settings import load_settings
from api.websocket.manager import WebSocketManager
from api.websocket.schemas import DeviceUpdateMessage

logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    settings = load_settings()
    auth_service = AuthService(
        secret_key=settings.secret_key,
        access_token_expire_minutes=settings.access_token_expire_minutes,
        refresh_token_expire_minutes=settings.refresh_token_expire_minutes,
    )
    app.state.auth_service = auth_service
    app.state.cookie_secure = settings.COOKIE_SECURE

    websocket_manager = WebSocketManager()
    app.state.websocket_manager = websocket_manager

    dm = await DevicesManager.from_storage(settings.storage_url)
    ts_service = await create_service(settings.storage_url)
    app.state.device_manager = dm
    app.state.ts_service = ts_service

    um = await UsersManager.from_storage(settings.storage_url)
    await um.ensure_default_admin()
    app.state.users_manager = um

    apps_svc = None
    try:
        apps_svc = await AppsService.from_storage(settings.storage_url, um)
        app.state.apps_service = apps_svc
        await apps_svc.start_health_check()
    except ValueError:
        logger.warning("Apps package requires PostgreSQL — apps disabled")
        app.state.apps_service = None

    try:
        am = await AssetsManager.from_storage(settings.storage_url)
        await am.ensure_default_root()
        app.state.assets_manager = am
    except ValueError:
        logger.warning("Assets package requires PostgreSQL — assets disabled")
        app.state.assets_manager = None

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
        await ts_service.close()
        await um.close()
        if apps_svc is not None:
            await apps_svc.close()
        if am is not None:
            await am.close()
        await websocket_manager.close_all()


def create_app(*, logging_dict_config: dict | None = None) -> FastAPI:
    if logging_dict_config:
        logging.config.dictConfig(logging_dict_config)
    app = FastAPI(title="Gridone API", lifespan=lifespan)
    register_exception_handlers(app)

    # Public routes (no JWT required)
    app.include_router(health_router, prefix="/health", tags=["health"])
    app.include_router(auth_router, prefix="/auth", tags=["auth"])
    app.include_router(apps_registration_router, prefix="/apps", tags=["apps"])

    # Protected routes — permissions are enforced per endpoint inside each router.
    # A blanket JWT dep is still applied so unauthenticated requests get a 401.
    jwt_dep = [Depends(get_current_user_id)]
    app.include_router(
        users_router, prefix="/users", tags=["users"], dependencies=jwt_dep
    )
    app.include_router(
        devices_router, prefix="/devices", tags=["devices"], dependencies=jwt_dep
    )
    app.include_router(
        transports_router,
        prefix="/transports",
        tags=["transports"],
        dependencies=jwt_dep,
    )
    app.include_router(
        drivers_router, prefix="/drivers", tags=["drivers"], dependencies=jwt_dep
    )
    app.include_router(
        timeseries_router,
        prefix="/timeseries",
        tags=["timeseries"],
        dependencies=jwt_dep,
    )
    app.include_router(
        assets_router,
        prefix="/assets",
        tags=["assets"],
        dependencies=jwt_dep,
    )
    app.include_router(
        apps_router,
        prefix="/apps",
        tags=["apps"],
        dependencies=jwt_dep,
    )
    app.include_router(websocket_routes.router, tags=["websocket"])

    return app


app = create_app()
