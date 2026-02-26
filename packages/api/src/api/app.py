import logging
import logging.config
from contextlib import asynccontextmanager
from datetime import UTC, datetime

from assets import AssetsManager
from devices_manager import Attribute, Device, DevicesManager
from fastapi import Depends, FastAPI
from timeseries import DataPoint, SeriesKey, create_service
from users import AuthorizationService, UsersManager
from users.auth import AuthService
from users.roles_manager import RolesManager
from users.storage import build_authorization_storage, build_users_storage

from api.asset_hierarchy_adapter import AssetHierarchyAdapter
from api.dependencies import get_current_user_id
from api.exception_handlers import register_exception_handlers
from api.routes import (
    assets_router,
    devices_router,
    drivers_router,
    roles_router,
    timeseries_router,
    transports_router,
)
from api.routes import websocket as websocket_routes
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
    )
    app.state.auth_service = auth_service

    websocket_manager = WebSocketManager()
    app.state.websocket_manager = websocket_manager

    dm = await DevicesManager.from_storage(settings.storage_url)
    ts_service = await create_service(settings.storage_url)
    app.state.device_manager = dm
    app.state.ts_service = ts_service

    # Users storage (returns pool for sharing with authorization storage)
    users_storage, pg_pool = await build_users_storage(settings.storage_url)
    um = UsersManager(users_storage)
    default_admin_id = await um.ensure_default_admin()
    app.state.users_manager = um

    try:
        am = await AssetsManager.from_storage(settings.storage_url)
        await am.ensure_default_root()
        app.state.assets_manager = am
    except ValueError:
        logger.warning("Assets package requires PostgreSQL — assets disabled")
        app.state.assets_manager = None

    # Authorization storage (shares the Postgres pool with users storage)
    authz_storage = await build_authorization_storage(
        settings.storage_url, pool=pg_pool
    )
    um.set_authorization_storage(authz_storage)

    roles_manager = RolesManager(authz_storage)
    await roles_manager.ensure_default_roles()
    app.state.roles_manager = roles_manager

    # Build hierarchy provider if assets are available
    hierarchy_provider = None
    if app.state.assets_manager is not None:
        hierarchy_provider = AssetHierarchyAdapter(app.state.assets_manager)

    authorization_service = AuthorizationService(
        storage=authz_storage,
        asset_hierarchy=hierarchy_provider,
    )
    app.state.authorization_service = authorization_service

    # Determine root asset ID for role assignment scoping
    root_asset_id: str | None = None
    if app.state.assets_manager is not None:
        root_ids = await app.state.assets_manager.get_root_ids()
        if root_ids:
            root_asset_id = root_ids[0]

    # Migrate legacy NULL asset_id assignments to root asset
    if root_asset_id is not None:
        await roles_manager.migrate_null_asset_assignments(root_asset_id)

    # Assign default roles to users without any role assignments
    all_users = await um.list_users()
    if root_asset_id is not None:
        await roles_manager.ensure_default_role_assignments(
            [u.id for u in all_users],
            root_asset_id,
            admin_user_id=default_admin_id,
        )

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
        roles_router,
        prefix="/roles",
        tags=["roles"],
        dependencies=jwt_dep,
    )
    app.include_router(websocket_routes.router, tags=["websocket"])

    return app


app = create_app()
