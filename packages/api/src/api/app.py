import asyncio
import logging
import logging.config
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from datetime import datetime

from automations import AutomationsService
from automations.trigger_providers.schedule import ScheduleTriggerProvider
from dashboards import DashboardsService
from fastapi import Depends, FastAPI

from api.action_providers.commands import CommandsActionProvider
from api.action_providers.notifications import NotificationsActionProvider
from api.dependencies import get_current_user_id
from api.exception_handlers import register_exception_handlers
from api.listeners.device import on_device_discovered
from api.listeners.fault import on_fault_transition
from api.listeners.timeseries import historise_attribute_update, record_attribute_point
from api.listeners.websocket import broadcast_attribute_update
from api.routes import (
    assets_router,
    automations_router,
    dashboards_router,
    devices_router,
    drivers_router,
    health_router,
    notifications_router,
    transports_ingress_router,
    transports_router,
)
from api.routes import websocket as websocket_routes
from api.routes.apps import apps_registration_router, apps_router
from api.routes.users import auth_router, users_router
from api.settings import load_settings
from api.targets import CompositeTargetResolver
from api.trigger_providers.change_event import ChangeEventTriggerProvider
from api.websocket.manager import WebSocketManager
from apps import AppsService
from assets import AssetsService
from commands import CommandsService, WriteResult
from devices_manager import DevicesService
from models.service import Service
from models.types import AttributeValueType, DataType
from notifications import NotificationsService
from timeseries import TimeSeriesService
from users import UsersService
from users.auth import AuthService


async def _stop_services(services: list[Service]) -> None:
    await asyncio.gather(*[svc.stop() for svc in services])


def _build_automations_service(
    storage_url: str | None,
    devices_service: DevicesService,
    commands_service: CommandsService,
    notifications_service: NotificationsService,
    timezone: str = "UTC",
) -> AutomationsService:
    """Assemble the automation providers exposed by this API."""
    return AutomationsService(
        storage_url=storage_url,
        trigger_providers=[
            ScheduleTriggerProvider(timezone),
            ChangeEventTriggerProvider(devices_service),
        ],
        action_providers=[
            CommandsActionProvider(commands_service),
            NotificationsActionProvider(notifications_service),
        ],
    )


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncIterator[None]:
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

    dm = DevicesService(settings.storage_url)
    ts_service = TimeSeriesService(
        settings.storage_url, default_timezone=settings.GRIDONE_TIMEZONE
    )
    await ts_service.start()
    app.state.device_manager = dm
    app.state.ts_service = ts_service

    users_service = UsersService(settings.storage_url)
    await users_service.start()
    app.state.users_service = users_service

    notifications_svc = NotificationsService(settings.storage_url)
    await notifications_svc.start()
    app.state.notifications_service = notifications_svc

    async def _write_device(
        device_id: str,
        attribute_name: str,
        value: AttributeValueType,
        *,
        confirm: bool = True,
    ) -> WriteResult:
        attr = await dm.write_device_attribute(
            device_id, attribute_name, value, confirm=confirm
        )
        return WriteResult(last_changed=attr.last_changed)

    async def _on_command_success(
        device_id: str,
        attribute: str,
        value: AttributeValueType,
        data_type: DataType,
        command_id: int,
        last_changed: datetime | None,
    ) -> None:
        await record_attribute_point(
            ts_service,
            device_id,
            attribute,
            value,
            data_type,
            last_changed,
            command_id=command_id,
        )

    commands_service = CommandsService(
        settings.storage_url,
        device_writer=_write_device,
        result_handler=_on_command_success,
        target_resolver=CompositeTargetResolver(dm),
    )
    await commands_service.start()
    app.state.commands_service = commands_service

    automations_svc = _build_automations_service(
        settings.storage_url,
        dm,
        commands_service,
        notifications_svc,
        settings.GRIDONE_TIMEZONE,
    )
    await automations_svc.start()
    app.state.automations_service = automations_svc

    apps_svc = AppsService(settings.storage_url, users_service)
    await apps_svc.start()
    app.state.apps_service = apps_svc

    assets_service = AssetsService(settings.storage_url)
    await assets_service.start()
    app.state.assets_service = assets_service

    dashboards_service = DashboardsService(settings.storage_url)
    await dashboards_service.start()
    app.state.dashboards_service = dashboards_service

    async def recipients() -> list[str]:
        users = await users_service.list_users()
        return [u.id for u in users if not u.is_blocked]

    dm.add_device_discovery_listener(
        on_device_discovered(notifications_svc, recipients)
    )
    dm.add_device_attribute_listener(on_fault_transition(notifications_svc, recipients))
    dm.add_device_attribute_listener(broadcast_attribute_update(websocket_manager))
    dm.add_device_attribute_listener(historise_attribute_update(ts_service))

    # Start the devices service last so listeners are registered before
    # storage is restored and polling begins.
    await dm.start()

    try:
        yield
    finally:
        await _stop_services(
            [
                dm,
                ts_service,
                commands_service,
                automations_svc,
                notifications_svc,
                users_service,
                apps_svc,
                assets_service,
                dashboards_service,
            ]
        )
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
    # Message ingress is device-level ingestion: the transport authenticates
    # each push itself from its config, outside the API's user-auth flow.
    app.include_router(
        transports_ingress_router, prefix="/transports", tags=["transports"]
    )

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
        assets_router,
        prefix="/assets",
        tags=["assets"],
        dependencies=jwt_dep,
    )
    app.include_router(
        automations_router,
        prefix="/automations",
        tags=["automations"],
        dependencies=jwt_dep,
    )
    app.include_router(
        notifications_router,
        prefix="/notifications",
        tags=["notifications"],
        dependencies=jwt_dep,
    )
    app.include_router(
        dashboards_router,
        prefix="/dashboards",
        tags=["dashboards"],
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
