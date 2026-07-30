import asyncio
import contextlib
import logging
from typing import Any

import httpx

from apps.config_validation import validate_config, validate_schema
from apps.errors import AppUnreachableError
from apps.models import App, AppStatus, PushStatus
from apps.storage.storage_backend import AppStorageBackend
from models.errors import InvalidError, NotFoundError
from users import UsersServiceInterface

logger = logging.getLogger(__name__)

# Timeout for request/response calls to an app (config proxy, enable/disable).
_APP_REQUEST_TIMEOUT = 10.0
# Health probes are polled every 60s, so they fail fast rather than block a tick.
_HEALTH_PROBE_TIMEOUT = 5.0


class AppsManager:
    def __init__(
        self,
        app_storage: AppStorageBackend,
        users_manager: UsersServiceInterface,
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

    # ── Config ───────────────────────────────────────────────────────────

    async def get_config_schema(self, app_id: str) -> dict:
        app = await self.get_app(app_id)
        return await self._proxy_app_request("GET", f"{app.api_url}/config/schema")

    async def get_config(self, app_id: str) -> dict[str, Any]:
        app = await self.get_app(app_id)
        return app.config or {}

    async def update_config(self, app_id: str, config: dict[str, Any]) -> App:
        """Validate, store, then best-effort push a new config to the app.

        The stored config is the source of truth: it is saved before the
        push attempt (with `push_status=pending`) so it survives even if the
        process dies mid-push. Nothing is stored if the schema fetch or the
        validation fails.

        The post-push write is targeted at `push_status` alone, so a health
        status change landing during the push is not reverted.
        """
        app = await self.get_app(app_id)
        schema = await self._proxy_app_request("GET", f"{app.api_url}/config/schema")
        validate_schema(schema)
        validate_config(config, schema)

        app = app.model_copy(
            update={"config": config, "push_status": PushStatus.PENDING}
        )
        await self._app_storage.save(app)

        push_status = await self._push_config(app)
        await self._app_storage.update_push_status(app.id, push_status)
        return app.model_copy(update={"push_status": push_status})

    async def _push_config(self, app: App) -> PushStatus:
        """Best-effort delivery of an app's stored config to the app itself.

        2xx -> ok, 4xx (the app rejects the config) -> rejected, anything
        else (unreachable, 5xx, timeout) -> pending, since the health-loop
        will retry delivery later.
        """
        try:
            resp = await self._http_client.request(
                "PATCH",
                f"{app.api_url}/config",
                timeout=_APP_REQUEST_TIMEOUT,
                json=app.config,
            )
            resp.raise_for_status()
        except httpx.HTTPStatusError as exc:
            status = exc.response.status_code
            if 400 <= status < 500:  # noqa: PLR2004
                return PushStatus.REJECTED
            logger.warning("Push of config to %s failed with %s", app.api_url, status)
            return PushStatus.PENDING
        except httpx.HTTPError as exc:
            logger.warning(
                "App unreachable while pushing config to %s: %s", app.api_url, exc
            )
            return PushStatus.PENDING
        return PushStatus.OK

    async def _proxy_app_request(
        self, method: str, url: str, json: dict | None = None
    ) -> dict:
        """Forward an HTTP request to an app endpoint.

        Raises:
            AppUnreachableError: if the app cannot be reached.
            NotFoundError: if the app returns 404.
            InvalidError: if the app returns a client error (4xx).
        """
        try:
            resp = await self._http_client.request(
                method, url, timeout=_APP_REQUEST_TIMEOUT, json=json
            )
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
                timeout=_APP_REQUEST_TIMEOUT,
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
                timeout=_APP_REQUEST_TIMEOUT,
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
                resp = await self._http_client.get(
                    app.health_url, timeout=_HEALTH_PROBE_TIMEOUT
                )
                new_status = (
                    AppStatus.HEALTHY if resp.is_success else AppStatus.UNHEALTHY
                )
            except httpx.HTTPError:
                new_status = AppStatus.UNHEALTHY
            if new_status != app.status:
                await self._app_storage.update_status(app.id, new_status)


__all__ = ["AppsManager"]
