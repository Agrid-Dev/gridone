from apps.models import App, RegistrationRequest


class MemoryRegistrationStorage:
    """In-memory storage backend for registration requests."""

    def __init__(self) -> None:
        self._requests: dict[str, RegistrationRequest] = {}

    async def get_by_id(self, request_id: str) -> RegistrationRequest | None:
        return self._requests.get(request_id)

    async def list_all(self) -> list[RegistrationRequest]:
        return sorted(self._requests.values(), key=lambda r: r.created_at, reverse=True)

    async def save(self, request: RegistrationRequest) -> None:
        self._requests[request.id] = request

    async def close(self) -> None:
        return None


class MemoryAppStorage:
    """In-memory storage backend for registered apps."""

    def __init__(self) -> None:
        self._apps: dict[str, App] = {}

    async def get_by_id(self, app_id: str) -> App | None:
        return self._apps.get(app_id)

    async def list_all(self) -> list[App]:
        return sorted(self._apps.values(), key=lambda a: a.created_at, reverse=True)

    async def save(self, app: App) -> None:
        self._apps[app.id] = app

    async def close(self) -> None:
        return None


__all__ = ["MemoryAppStorage", "MemoryRegistrationStorage"]
