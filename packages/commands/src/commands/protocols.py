from __future__ import annotations

from typing import TYPE_CHECKING, Any, Protocol

if TYPE_CHECKING:
    from datetime import datetime

    from commands.models import Target, WriteResult
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


class TargetResolver(Protocol):
    """Resolves a :class:`Target` into the list of device ids it matches.

    The target is an opaque dict; the resolver lives in the composition root
    so the commands package never depends on ``devices_manager`` or
    ``assets``.
    """

    async def resolve(self, target: Target) -> list[str]: ...
