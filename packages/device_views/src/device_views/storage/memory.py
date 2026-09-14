from device_views.models import DeviceView
from models.errors import NotFoundError


class MemoryViewStorage:
    def __init__(self) -> None:
        self._views: dict[str, DeviceView] = {}

    async def list(self) -> list[DeviceView]:
        return [
            view.model_copy(deep=True)
            for view in sorted(self._views.values(), key=lambda v: (v.name, v.id))
        ]

    async def get(self, view_id: str) -> DeviceView:
        if view_id not in self._views:
            msg = "Device view not found"
            raise NotFoundError(msg)
        return self._views[view_id].model_copy(deep=True)

    async def create(self, view: DeviceView) -> DeviceView:
        self._views[view.id] = view.model_copy(deep=True)
        return view

    async def update(self, view: DeviceView) -> DeviceView:
        await self.get(view.id)
        self._views[view.id] = view.model_copy(deep=True)
        return view

    async def delete(self, view_id: str) -> None:
        await self.get(view_id)
        del self._views[view_id]

    async def close(self) -> None:
        pass
