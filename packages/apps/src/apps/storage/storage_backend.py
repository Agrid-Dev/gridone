from typing import Protocol

from apps.models import App, AppStatus, PushStatus, RegistrationRequest


class RegistrationRequestStorageBackend(Protocol):
    async def get_by_id(self, request_id: str) -> RegistrationRequest | None: ...

    async def list_all(self) -> list[RegistrationRequest]: ...

    async def save(self, request: RegistrationRequest) -> None: ...

    async def close(self) -> None: ...


class AppStorageBackend(Protocol):
    async def get_by_id(self, app_id: str) -> App | None: ...

    async def list_all(self) -> list[App]: ...

    async def save(self, app: App) -> None: ...

    async def update_status(self, app_id: str, status: AppStatus) -> None:
        """Update only the health status, leaving config and push status intact.

        Targeted on purpose: the health loop writes from a snapshot taken
        before its probes, so a full-row save could revert a config stored
        in the meantime. No-op when no row matches `app_id`.
        """
        ...

    async def update_push_status(self, app_id: str, push_status: PushStatus) -> None:
        """Update only the config push status. No-op when no row matches `app_id`."""
        ...

    async def close(self) -> None: ...


__all__ = ["AppStorageBackend", "RegistrationRequestStorageBackend"]
