"""Request and query schemas for the command-dispatch endpoints."""

from __future__ import annotations

from datetime import datetime

from devices_manager.types import AttributeValueType
from fastapi import Query
from models.types import SortOrder
from pydantic import BaseModel, Field


class CommandsQuery(BaseModel):
    """Query parameters accepted by ``GET /commands``."""

    ids: list[int] | None = None
    group_id: str | None = None
    device_id: str | None = None
    attribute: str | None = None
    user_id: str | None = None
    start: datetime | None = None
    end: datetime | None = None
    last: str | None = None
    sort: SortOrder = SortOrder.ASC


def get_commands_query(  # noqa: PLR0913
    ids: list[int] | None = Query(None),
    group_id: str | None = Query(None),
    filter_device_id: str | None = Query(None, alias="device_id"),
    attribute: str | None = Query(None),
    user_id: str | None = Query(None),
    start: datetime | None = Query(None),
    end: datetime | None = Query(None),
    last: str | None = Query(None),
    sort: SortOrder = Query(SortOrder.ASC),
) -> CommandsQuery:
    return CommandsQuery(
        ids=ids,
        group_id=group_id,
        device_id=filter_device_id,
        attribute=attribute,
        user_id=user_id,
        start=start,
        end=end,
        last=last,
        sort=sort,
    )


class SingleDeviceCommand(BaseModel):
    """Request body for ``POST /devices/{device_id}/commands``."""

    attribute: str
    value: AttributeValueType
    confirm: bool = True


class BatchDeviceCommand(BaseModel):
    """Request body for ``POST /devices/commands`` (explicit device list)."""

    device_ids: list[str] = Field(min_length=1)
    attribute: str
    value: AttributeValueType
    confirm: bool = True


class AssetCommand(BaseModel):
    """Request body for ``POST /assets/{asset_id}/commands``."""

    attribute: str
    value: AttributeValueType
    device_type: str
    recursive: bool = False
    confirm: bool = True


class BatchDispatchResponse(BaseModel):
    """Response body for accepted multi-device dispatches."""

    group_id: str
    total: int
