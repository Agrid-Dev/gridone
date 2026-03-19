from typing import Protocol

from apps.models import RegistrationRequest


class RegistrationRequestStorageBackend(Protocol):
    async def get_by_id(self, request_id: str) -> RegistrationRequest | None: ...

    async def list_all(self) -> list[RegistrationRequest]: ...

    async def save(self, request: RegistrationRequest) -> None: ...

    async def close(self) -> None: ...


__all__ = ["RegistrationRequestStorageBackend"]
