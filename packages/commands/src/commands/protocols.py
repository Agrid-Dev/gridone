from __future__ import annotations

from typing import TYPE_CHECKING, Any, Protocol

if TYPE_CHECKING:
    from datetime import datetime

    from commands.models import DataPointValue, DataType, WriteResult


class DeviceWriter(Protocol):
    async def write_device_attribute(
        self,
        device_id: str,
        attribute_name: str,
        value: Any,  # noqa: ANN401
        *,
        confirm: bool = True,
    ) -> WriteResult: ...


class CommandResultHandler(Protocol):
    async def on_command_success(  # noqa: PLR0913
        self,
        device_id: str,
        attribute: str,
        value: DataPointValue,
        data_type: DataType,
        command_id: int,
        last_changed: datetime | None,
    ) -> None: ...
