from __future__ import annotations

from typing import TYPE_CHECKING, Protocol

from commands.models import SortOrder

if TYPE_CHECKING:
    from datetime import datetime

    from commands.models import Command, DataPointValue
    from models.pagination import Page, PaginationParams
    from models.types import DataType


class CommandsServiceInterface(Protocol):
    async def dispatch(  # noqa: PLR0913
        self,
        *,
        device_id: str,
        attribute: str,
        value: DataPointValue,
        data_type: DataType,
        user_id: str,
        confirm: bool = True,
        group_id: str | None = None,
    ) -> Command: ...

    async def get_commands(  # noqa: PLR0913
        self,
        *,
        ids: list[int] | None = None,
        group_id: str | None = None,
        device_id: str | None = None,
        attribute: str | None = None,
        user_id: str | None = None,
        start: datetime | None = None,
        end: datetime | None = None,
        sort: SortOrder = SortOrder.ASC,
        pagination: PaginationParams | None = None,
    ) -> Page[Command]: ...
