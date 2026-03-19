import asyncio
import contextlib
import logging
import uuid
from datetime import UTC, datetime

import httpx
import yaml
from models.errors import InvalidError, NotFoundError
from users import User, UserCreate, UsersManagerInterface
from users.models import UserType
from users.password import hash_password

from apps.models import (
    REQUIRED_CONFIG_FIELDS,
    App,
    AppStatus,
    RegistrationRequest,
    RegistrationRequestCreate,
    RegistrationRequestStatus,
)
from apps.storage.storage_backend import (
    AppStorageBackend,
    RegistrationRequestStorageBackend,
)

logger = logging.getLogger(__name__)


class AppsManager:
    def __init__(
        self,
        storage: RegistrationRequestStorageBackend,
        app_storage: AppStorageBackend,
        users_manager: UsersManagerInterface,
        http_client: httpx.AsyncClient | None = None,
    ) -> None:
        self._storage = storage
        self._app_storage = app_storage
        self._users_manager = users_manager
        self._http_client = http_client or httpx.AsyncClient()
        self._health_task: asyncio.Task | None = None

    async def close(self) -> None:
        await self.stop_health_check()
        await self._storage.close()
        # app_storage shares the same pool — only close once
        await self._http_client.aclose()

    @classmethod
    async def from_storage(
        cls, storage_url: str, users_manager: UsersManagerInterface
    ) -> "AppsManager":
        from apps.storage import build_apps_storages  # noqa: PLC0415

        reg_storage, app_storage = await build_apps_storages(storage_url)
        return cls(reg_storage, app_storage, users_manager)

    # ── Registration requests ────────────────────────────────────────────

    @staticmethod
    def _validate_config(config: str) -> None:
        """Validate the YAML config string.

        The config must be well-formed YAML containing at least the
        required manifest fields.
        """
        if not config:
            msg = "config is required for registration requests"
            raise InvalidError(msg)
        try:
            parsed = yaml.safe_load(config)
        except yaml.YAMLError as e:
            msg = f"config is not valid YAML: {e}"
            raise InvalidError(msg) from e
        if not isinstance(parsed, dict):
            msg = "config must be a YAML mapping"
            raise InvalidError(msg)
        missing = REQUIRED_CONFIG_FIELDS - parsed.keys()
        if missing:
            msg = f"config is missing required fields: {', '.join(sorted(missing))}"
            raise InvalidError(msg)

    async def create_registration_request(
        self, create_data: RegistrationRequestCreate
    ) -> RegistrationRequest:
        self._validate_config(create_data.config)
        request = RegistrationRequest(
            id=str(uuid.uuid4()),
            username=create_data.username,
            hashed_password=hash_password(create_data.password),
            status=RegistrationRequestStatus.PENDING,
            created_at=datetime.now(UTC),
            config=create_data.config,
        )
        await self._storage.save(request)
        return request

    async def list_registration_requests(self) -> list[RegistrationRequest]:
        return await self._storage.list_all()

    async def get_registration_request(self, request_id: str) -> RegistrationRequest:
        request = await self._storage.get_by_id(request_id)
        if request is None:
            msg = f"Registration request '{request_id}' not found"
            raise NotFoundError(msg)
        return request

    async def accept_registration_request(
        self, request_id: str
    ) -> tuple[RegistrationRequest, User, App]:
        request = await self.get_registration_request(request_id)
        if request.status != RegistrationRequestStatus.PENDING:
            msg = (
                f"Registration request '{request_id}' "
                f"is not pending (status: {request.status})"
            )
            raise InvalidError(msg)

        user = await self._users_manager.create_user(
            UserCreate(
                username=request.username,
                password="unused",  # noqa: S106 — pre_hashed_password takes precedence
                type=UserType.SERVICE_ACCOUNT,
            ),
            pre_hashed_password=request.hashed_password,
        )

        parsed = yaml.safe_load(request.config)
        app = App(
            id=str(uuid.uuid4()),
            user_id=user.id,
            name=parsed["name"],
            description=parsed.get("description", ""),
            api_url=parsed["api_url"],
            icon=parsed.get("icon", ""),
            status=AppStatus.REGISTERED,
            manifest=request.config,
        )
        await self._app_storage.save(app)

        accepted = request.model_copy(
            update={"status": RegistrationRequestStatus.ACCEPTED}
        )
        await self._storage.save(accepted)
        return accepted, user, app

    async def discard_registration_request(
        self, request_id: str
    ) -> RegistrationRequest:
        request = await self.get_registration_request(request_id)
        if request.status != RegistrationRequestStatus.PENDING:
            msg = (
                f"Registration request '{request_id}' "
                f"is not pending (status: {request.status})"
            )
            raise InvalidError(msg)
        discarded = request.model_copy(
            update={"status": RegistrationRequestStatus.DISCARDED}
        )
        await self._storage.save(discarded)
        return discarded

    # ── App CRUD ─────────────────────────────────────────────────────────

    async def list_apps(self) -> list[App]:
        return await self._app_storage.list_all()

    async def get_app(self, app_id: str) -> App:
        app = await self._app_storage.get_by_id(app_id)
        if app is None:
            msg = f"App '{app_id}' not found"
            raise NotFoundError(msg)
        return app

    # ── Enable / Disable ─────────────────────────────────────────────────

    async def enable_app(self, app_id: str) -> App:
        app = await self.get_app(app_id)
        try:
            await self._http_client.post(
                f"{app.api_url.rstrip('/')}/enable",
                json={"enabled": True},
                timeout=10.0,
            )
        except httpx.HTTPError:
            logger.warning("Failed to call enable on app %s", app_id, exc_info=True)
        await self._users_manager.unblock_user(app.user_id)
        return app

    async def disable_app(self, app_id: str) -> App:
        app = await self.get_app(app_id)
        try:
            await self._http_client.post(
                f"{app.api_url.rstrip('/')}/enable",
                json={"enabled": False},
                timeout=10.0,
            )
        except httpx.HTTPError:
            logger.warning("Failed to call disable on app %s", app_id, exc_info=True)
        await self._users_manager.block_user(app.user_id)
        return app

    # ── Health monitoring ────────────────────────────────────────────────

    async def start_health_check(self, interval_seconds: int = 60) -> None:
        self._health_task = asyncio.create_task(
            self._health_check_loop(interval_seconds)
        )

    async def stop_health_check(self) -> None:
        if self._health_task is not None and not self._health_task.done():
            self._health_task.cancel()
            with contextlib.suppress(asyncio.CancelledError):
                await self._health_task
            self._health_task = None

    async def _health_check_loop(self, interval: int) -> None:
        while True:
            await self._check_all_apps_health()
            await asyncio.sleep(interval)

    async def _check_all_apps_health(self) -> None:
        apps = await self._app_storage.list_all()
        for app in apps:
            try:
                resp = await self._http_client.get(app.health_url, timeout=5.0)
                new_status = (
                    AppStatus.HEALTHY if resp.is_success else AppStatus.UNHEALTHY
                )
            except httpx.HTTPError:
                new_status = AppStatus.UNHEALTHY
            if new_status != app.status:
                updated = app.model_copy(update={"status": new_status})
                await self._app_storage.save(updated)


__all__ = ["AppsManager"]
