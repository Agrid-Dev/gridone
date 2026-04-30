import logging
import logging.config
from contextlib import asynccontextmanager
from datetime import UTC, datetime

from apps import AppsService
from assets import AssetsService
from automations import AutomationsService
from automations.trigger_providers.schedule import ScheduleTriggerProvider
from commands import CommandsService, Target, WriteResult
from devices_manager import Attribute, CoreDevice, DevicesManager
from fastapi import Depends, FastAPI
from models.resource_reference import ResourceReference
from models.types import AttributeValueType, DataType, Severity
from notifications import NotificationsService
from timeseries import DataPoint, SeriesKey, create_service
from users import UsersService
from users.auth import AuthService

from api.dependencies import get_current_user_id
from api.devices_filter import to_list_devices_kwargs
from api.exception_handlers import register_exception_handlers
from api.routes import (
    assets_router,
    automations_router,
    devices_router,
    drivers_router,
    health_router,
    notifications_router,
    transports_router,
)
from api.routes import websocket as websocket_routes
from api.routes.apps import apps_registration_router, apps_router
from api.routes.users import auth_router, users_router
from api.settings import load_settings
from api.trigger_providers.change_event import ChangeEventTriggerProvider
from api.websocket.manager import WebSocketManager
from api.websocket.schemas import DeviceUpdateMessage


class _CompositeTargetResolver:
    """TargetResolver backed by DevicesManager.

    The target is an opaque dict whose keys match ``DM.list_devices`` kwargs,
    plus the ``asset_id`` alias. ``asset_id`` is translated into a
    ``tags["asset_id"]`` filter here rather than exposed through
    ``DM.list_devices`` directly, so devices_manager stays unaware of the
    assets service. The tag convention mirrors the UI
    (``setDeviceTag(id, "asset_id", assetId)``).
    """

    def __init__(self, dm: DevicesManager) -> None:
        self._dm = dm

    async def resolve(self, target: Target) -> list[str]:
        kwargs = to_list_devices_kwargs(dict(target))
        return [d.id for d in self._dm.list_devices(**kwargs)]


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
        await ts_service.upsert_points(
            SeriesKey(owner_id=device_id, metric=attribute),
            [
                DataPoint(
                    timestamp=last_changed or datetime.now(UTC),
                    value=value,
                    command_id=command_id,
                )
            ],
            create_if_not_found=True,
        )

    commands_service = CommandsService(
        settings.storage_url,
        device_writer=_write_device,
        result_handler=_on_command_success,
        target_resolver=_CompositeTargetResolver(dm),
    )
    await commands_service.start()
    app.state.commands_service = commands_service

    async def _automation_action_dispatcher(
        *, template_id: str, user_id: str, confirm: bool = False
    ) -> str:
        # Bridges commands → automations: projects ``BatchCommandDispatch``
        # down to the opaque ``output_id`` the automations service stores on
        # ``AutomationExecution``. Keeping this map at the composition root
        # means the automations package stays unaware of ``batch_id``.
        dispatch = await commands_service.dispatch_from_template(
            template_id=template_id, user_id=user_id, confirm=confirm
        )
        return dispatch.batch_id

    automations_svc = AutomationsService(
        storage_url=settings.storage_url,
        trigger_providers=[
            ScheduleTriggerProvider(),
            ChangeEventTriggerProvider(dm),
        ],
        action_dispatcher=_automation_action_dispatcher,
    )
    await automations_svc.start()
    app.state.automations_service = automations_svc

    apps_svc = AppsService(settings.storage_url, users_service)
    await apps_svc.start()
    app.state.apps_service = apps_svc

    assets_service = AssetsService(settings.storage_url)
    await assets_service.start()
    app.state.assets_service = assets_service

    async def on_device_discovered(device: CoreDevice) -> None:
        users = await users_service.list_users()
        await notifications_svc.dispatch(
            title="New device discovered",
            body=f"A new device [{device.name}]({ResourceReference('device', device.id).serialize()}) was recognised by a driver and successfully registered.",
            severity=Severity.INFO,
            user_ids=[u.id for u in users if not u.is_blocked],
            correlation_id=device.id,
        )

    dm.add_device_discovery_listener(on_device_discovered)

    async def on_attribute_update(
        device: CoreDevice, attribute_name: str, attribute: Attribute
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

    await dm.start_sync()
    try:
        yield
    finally:
        await dm.stop()
        await ts_service.close()
        await commands_service.stop()
        await automations_svc.close()
        await notifications_svc.stop()
        await users_service.stop()
        await apps_svc.stop()
        await assets_service.stop()
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
        apps_router,
        prefix="/apps",
        tags=["apps"],
        dependencies=jwt_dep,
    )
    app.include_router(websocket_routes.router, tags=["websocket"])

    return app


app = create_app()
