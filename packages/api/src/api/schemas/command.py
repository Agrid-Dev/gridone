"""Request and query schemas for the command-dispatch endpoints."""

from __future__ import annotations

from datetime import datetime

from devices_manager.types import AttributeValueType
from fastapi import Query
from models.types import SortOrder
from pydantic import BaseModel, model_validator


class CommandsQuery(BaseModel):
    """Query parameters accepted by ``GET /commands``."""

    ids: list[int] | None = None
    batch_id: str | None = None
    device_id: str | None = None
    attribute: str | None = None
    user_id: str | None = None
    start: datetime | None = None
    end: datetime | None = None
    last: str | None = None
    sort: SortOrder = SortOrder.ASC


def get_commands_query(  # noqa: PLR0913
    ids: list[int] | None = Query(None),
    batch_id: str | None = Query(None),
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
        batch_id=batch_id,
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
    """Request body for ``POST /devices/commands``.

    Target selection is one of (exactly one required):

    * ``device_ids`` — explicit, non-empty list of device IDs
    * ``device_type`` — resolved server-side to all devices of that type
    """

    device_ids: list[str] | None = None
    device_type: str | None = None
    attribute: str
    value: AttributeValueType
    confirm: bool = True

    @model_validator(mode="after")
    def _exactly_one_target(self) -> "BatchDeviceCommand":
        has_ids = self.device_ids is not None
        has_type = self.device_type is not None
        if has_ids == has_type:
            msg = "Exactly one of 'device_ids' or 'device_type' must be provided"
            raise ValueError(msg)
        if has_ids and len(self.device_ids or []) == 0:
            msg = "'device_ids' must not be empty"
            raise ValueError(msg)
        return self


class AssetCommand(BaseModel):
    """Request body for ``POST /assets/{asset_id}/commands``."""

    attribute: str
    value: AttributeValueType
    device_type: str
    recursive: bool = False
    confirm: bool = True


class BatchDispatchResponse(BaseModel):
    """Response body for accepted multi-device dispatches."""

    batch_id: str
    total: int
