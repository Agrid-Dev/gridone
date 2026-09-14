from datetime import UTC, datetime

from device_views.models import DeviceView, DeviceViewInput
from device_views.storage import ViewStorage, build_storage
from models.errors import StorageNotInitializedError
from models.ids import gen_id


class DeviceViewsService:
    def __init__(self, storage_url: str | None) -> None:
        self._storage_url = storage_url
        self._storage: ViewStorage | None = None

    @property
    def storage(self) -> ViewStorage:
        if self._storage is None:
            msg = "Device views service has not been started"
            raise StorageNotInitializedError(msg)
        return self._storage

    async def start(self) -> None:
        if self._storage is None:
            self._storage = await build_storage(self._storage_url)

    async def stop(self) -> None:
        if self._storage is not None:
            await self._storage.close()
            self._storage = None

    async def list(self) -> list[DeviceView]:
        return await self.storage.list()

    async def get(self, view_id: str) -> DeviceView:
        return await self.storage.get(view_id)

    async def create(self, params: DeviceViewInput) -> DeviceView:
        now = datetime.now(UTC)
        return await self.storage.create(
            DeviceView(
                **params.model_dump(),
                id=gen_id(),
                created_at=now,
                updated_at=now,
            )
        )

    async def update(self, view_id: str, params: DeviceViewInput) -> DeviceView:
        existing = await self.get(view_id)
        view = DeviceView(
            **params.model_dump(),
            id=view_id,
            created_at=existing.created_at,
            updated_at=datetime.now(UTC),
        )
        return await self.storage.update(view)

    async def delete(self, view_id: str) -> None:
        await self.storage.delete(view_id)
