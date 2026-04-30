from typing import Any

from apps.apps_manager import AppsManager
from apps.models import (
    App,
    RegistrationRequest,
    RegistrationRequestCreate,
)
from apps.registration_service import RegistrationService
from apps.storage import AppsStorages, build_apps_storages
from models.service import Service
from users import User, UsersServiceInterface

DEFAULT_HEALTH_CHECK_INTERVAL = 60


class AppsService(Service):
    """Public service surface for the apps package.

    Wraps the inner `AppsManager` (app CRUD, enable/disable, health checks)
    and `RegistrationService` (registration request lifecycle) as private
    collaborators wired during `start()`.
    """

    _storages: AppsStorages
    _apps_manager: AppsManager
    _registration: RegistrationService

    def __init__(
        self,
        storage_url: str | None,
        users_service: UsersServiceInterface,
        *,
        health_check_interval_seconds: int = DEFAULT_HEALTH_CHECK_INTERVAL,
    ) -> None:
        self._storage_url = storage_url
        self._users_service = users_service
        self._health_check_interval_seconds = health_check_interval_seconds

    async def start(self) -> None:
        self._storages = await build_apps_storages(self._storage_url)
        self._apps_manager = AppsManager(self._storages.apps, self._users_service)
        self._registration = RegistrationService(
            self._storages.registration,
            self._storages.apps,
            self._users_service,
        )
        await self._apps_manager.start_health_check(self._health_check_interval_seconds)

    async def stop(self) -> None:
        if hasattr(self, "_apps_manager"):
            await self._apps_manager.close()
        if hasattr(self, "_storages"):
            await self._storages.close()

    # ── App CRUD / proxy / enable-disable (delegated to AppsManager) ─────

    async def list_apps(self) -> list[App]:
        return await self._apps_manager.list_apps()

    async def get_app(self, app_id: str) -> App:
        return await self._apps_manager.get_app(app_id)

    async def get_config_schema(self, app_id: str) -> dict[str, Any]:
        return await self._apps_manager.get_config_schema(app_id)

    async def get_config(self, app_id: str) -> dict[str, Any]:
        return await self._apps_manager.get_config(app_id)

    async def update_config(
        self, app_id: str, config: dict[str, Any]
    ) -> dict[str, Any]:
        return await self._apps_manager.update_config(app_id, config)

    async def enable_app(self, app_id: str) -> App:
        return await self._apps_manager.enable_app(app_id)

    async def disable_app(self, app_id: str) -> App:
        return await self._apps_manager.disable_app(app_id)

    # ── Registration requests (delegated to RegistrationService) ─────────

    async def create_registration_request(
        self, create_data: RegistrationRequestCreate
    ) -> RegistrationRequest:
        return await self._registration.create_registration_request(create_data)

    async def list_registration_requests(self) -> list[RegistrationRequest]:
        return await self._registration.list_registration_requests()

    async def get_registration_request(self, request_id: str) -> RegistrationRequest:
        return await self._registration.get_registration_request(request_id)

    async def accept_registration_request(
        self, request_id: str
    ) -> tuple[RegistrationRequest, User, App]:
        return await self._registration.accept_registration_request(request_id)

    async def discard_registration_request(
        self, request_id: str
    ) -> RegistrationRequest:
        return await self._registration.discard_registration_request(request_id)


__all__ = ["AppsService"]
