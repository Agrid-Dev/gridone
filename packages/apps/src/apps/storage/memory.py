from apps.models import App, AppStatus, PushStatus, RegistrationRequest


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
    """In-memory storage backend for registered apps.

    Targeted updates replace the stored model with a copy rather than
    mutating it. This backend hands out its models by reference, so an
    in-place mutation would retroactively update snapshots already held by
    callers — hiding the very staleness the targeted updates guard against,
    while postgres (which rebuilds models per read) would not.
    """

    def __init__(self) -> None:
        self._apps: dict[str, App] = {}

    async def get_by_id(self, app_id: str) -> App | None:
        return self._apps.get(app_id)

    async def list_all(self) -> list[App]:
        return sorted(self._apps.values(), key=lambda a: a.created_at, reverse=True)

    async def save(self, app: App) -> None:
        self._apps[app.id] = app

    async def update_status(self, app_id: str, status: AppStatus) -> None:
        app = self._apps.get(app_id)
        if app is None:
            return
        self._apps[app_id] = app.model_copy(update={"status": status})

    async def update_push_status(self, app_id: str, push_status: PushStatus) -> None:
        app = self._apps.get(app_id)
        if app is None:
            return
        self._apps[app_id] = app.model_copy(update={"push_status": push_status})

    async def close(self) -> None:
        return None


__all__ = ["MemoryAppStorage", "MemoryRegistrationStorage"]
