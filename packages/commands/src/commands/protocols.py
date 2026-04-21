from __future__ import annotations

from typing import TYPE_CHECKING, Any, Protocol

if TYPE_CHECKING:
    from datetime import datetime

    from commands.models import DevicesFilter, WriteResult
    from models.types import AttributeValueType, DataType


class DeviceWriter(Protocol):
    async def __call__(
        self,
        device_id: str,
        attribute_name: str,
        value: Any,  # noqa: ANN401
        *,
        confirm: bool = True,
    ) -> WriteResult: ...


class CommandResultHandler(Protocol):
    async def __call__(  # noqa: PLR0913
        self,
        device_id: str,
        attribute: str,
        value: AttributeValueType,
        data_type: DataType,
        command_id: int,
        last_changed: datetime | None,
    ) -> None: ...


class DeviceTargetResolver(Protocol):
    """Expands hierarchy-aware filters and queries DM for matching device ids.
    Lives outside DM so DM never imports assets; wired in composition root."""

    async def resolve(self, devices_filter: DevicesFilter) -> list[str]: ...
