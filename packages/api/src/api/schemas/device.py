from __future__ import annotations

from datetime import datetime

from devices_manager.types import AttributeValueType
from fastapi import Query
from pydantic import BaseModel
from timeseries.domain import SortOrder


class AttributeUpdate(BaseModel):
    value: AttributeValueType


class StateUpdate(BaseModel):
    values: dict[str, AttributeValueType]
    timestamp: datetime | None = None


class CommandsQuery(BaseModel):
    ids: list[int] | None = None
    device_id: str | None = None
    attribute: str | None = None
    user_id: str | None = None
    start: datetime | None = None
    end: datetime | None = None
    last: str | None = None
    sort: SortOrder = SortOrder.ASC


def get_commands_query(
    ids: list[int] | None = Query(None),
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
        device_id=filter_device_id,
        attribute=attribute,
        user_id=user_id,
        start=start,
        end=end,
        last=last,
        sort=sort,
    )
