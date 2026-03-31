import asyncio
import contextlib
import logging

import httpx
from models.errors import AppUnreachableError, InvalidError, NotFoundError
from users import UsersManagerInterface

from apps.models import App, AppStatus
from apps.storage.storage_backend import AppStorageBackend

logger = logging.getLogger(__name__)


class AppsManager:
    def __init__(
        self,
        app_storage: AppStorageBackend,
        users_manager: UsersManagerInterface,
        http_client: httpx.AsyncClient | None = None,
    ) -> None:
        self._app_storage = app_storage
        self._users_manager = users_manager
        self._http_client = http_client or httpx.AsyncClient()
        self._health_task: asyncio.Task | None = None

    async def close(self) -> None:
        await self.stop_health_check()
        await self._http_client.aclose()

    # ── App CRUD ─────────────────────────────────────────────────────────

    async def list_apps(self) -> list[App]:
        return await self._app_storage.list_all()

    async def get_app(self, app_id: str) -> App:
        app = await self._app_storage.get_by_id(app_id)
        if app is None:
            msg = f"App '{app_id}' not found"
            raise NotFoundError(msg)
        return app

    # ── Config proxy ──────────────────────────────────────────────────────

    async def get_config_schema(self, app_id: str) -> dict:
        app = await self.get_app(app_id)
        return await self._proxy_app_request("GET", f"{app.api_url}/config/schema")

    async def get_config(self, app_id: str) -> dict:
        app = await self.get_app(app_id)
        return await self._proxy_app_request("GET", f"{app.api_url}/config")

    async def update_config(self, app_id: str, config: dict) -> dict:
        app = await self.get_app(app_id)
        return await self._proxy_app_request(
            "PATCH", f"{app.api_url}/config", json=config
        )

    async def _proxy_app_request(self, method: str, url: str, **kwargs: object) -> dict:
        """Forward an HTTP request to an app endpoint.

        Raises:
            AppUnreachableError: if the app cannot be reached.
            NotFoundError: if the app returns 404.
            InvalidError: if the app returns a client error (4xx).
        """
        try:
            resp = await self._http_client.request(method, url, timeout=10.0, **kwargs)
            resp.raise_for_status()
        except httpx.HTTPStatusError as exc:
            status = exc.response.status_code
            try:
                detail = exc.response.json().get("detail", exc.response.text)
            except (ValueError, KeyError):
                detail = exc.response.text
            if status == 404:  # noqa: PLR2004
                raise NotFoundError(detail) from exc
            if status >= 500:  # noqa: PLR2004
                logger.warning("App at %s returned %s: %s", url, status, detail)
                msg = "App returned an unexpected error"
                raise AppUnreachableError(msg) from exc
            msg = f"App returned {status}: {detail}"
            raise InvalidError(msg) from exc
        except httpx.HTTPError as exc:
            logger.warning("App unreachable at %s: %s", url, exc)
            msg = "App is unreachable"
            raise AppUnreachableError(msg) from exc
        return resp.json()

    # ── Enable / Disable ─────────────────────────────────────────────────

    async def enable_app(self, app_id: str) -> App:
        app = await self.get_app(app_id)
        try:
            await self._http_client.post(
                app.enable_url,
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
                app.enable_url,
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
                updated = app.with_status(new_status)
                await self._app_storage.save(updated)


__all__ = ["AppsManager"]
