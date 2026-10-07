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

    async def save(self, app: App) -> None:
        """Insert an app, or replace every stored field but its health.

        A new row takes the model's `status` and `status_message`. An existing
        row keeps its own pair: only `update_status` writes it, since the model
        saved here may predate the last health probe — and a status from the
        model beside the stored message would be a pair no probe reported.
        """
        ...

    async def update_status(
        self, app_id: str, status: AppStatus, message: str | None
    ) -> None:
        """Update only the health status and its message, leaving the rest intact.

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
