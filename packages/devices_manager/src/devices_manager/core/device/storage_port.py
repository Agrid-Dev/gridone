from __future__ import annotations

from typing import TYPE_CHECKING, Protocol

if TYPE_CHECKING:
    from datetime import datetime

    from .device import CoreDevice
    from .device_base import DeviceBase


class DeviceStorage(Protocol):
    """Domain-typed persistence port for devices.

    Asymmetric by design: ``write`` snapshots a live :class:`CoreDevice`,
    but ``read`` returns a detached :class:`DeviceBase` — storage cannot
    assemble a live device, which needs its driver, transport, and update
    listener resolved above the storage layer.
    """

    async def read(self, item_id: str) -> DeviceBase: ...

    async def write(self, item_id: str, device: CoreDevice) -> None: ...

    async def read_all(self) -> list[DeviceBase]: ...

    async def list_all(self) -> list[str]: ...

    async def delete(self, item_id: str) -> None: ...

    async def set_tag(
        self, device_id: str, key: str, value: str, updated_at: datetime
    ) -> None: ...

    async def delete_tag(
        self, device_id: str, key: str, updated_at: datetime
    ) -> None: ...
