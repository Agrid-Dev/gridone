from users import UsersManagerInterface

from apps.manager import AppsManager
from apps.registration_service import RegistrationService
from apps.storage import build_apps_storages


class AppsService:
    def __init__(
        self,
        registration: RegistrationService,
        apps: AppsManager,
    ) -> None:
        self.registration = registration
        self.apps = apps

    @classmethod
    async def from_storage(
        cls, storage_url: str, users_manager: UsersManagerInterface
    ) -> "AppsService":
        reg_storage, app_storage = await build_apps_storages(storage_url)
        registration = RegistrationService(reg_storage, app_storage, users_manager)
        apps = AppsManager(app_storage, users_manager)
        return cls(registration, apps)

    async def start_health_check(self, interval_seconds: int = 60) -> None:
        await self.apps.start_health_check(interval_seconds)

    async def close(self) -> None:
        await self.apps.close()
        await self.registration.close()
        # app_storage shares the same pool — only registration.close() closes it


__all__ = ["AppsService"]
