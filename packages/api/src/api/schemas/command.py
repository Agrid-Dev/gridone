"""Request and query schemas for the command-dispatch endpoints."""

from __future__ import annotations

from datetime import datetime

from devices_manager.types import AttributeValueType
from fastapi import Query
from models.types import DataType, SortOrder
from pydantic import BaseModel, ConfigDict


class CommandsQuery(BaseModel):
    """Query parameters accepted by ``GET /commands``."""

    ids: list[int] | None = None
    batch_id: str | None = None
    template_id: str | None = None
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
    template_id: str | None = Query(None),
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
        template_id=template_id,
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


class DevicesFilterBody(BaseModel):
    """HTTP shape of a devices filter, mirroring ``DM.list_devices`` kwargs.

    This is the shape of the ``target`` field on the batch-dispatch body.
    Unknown keys are rejected with 422; the commands service treats this as
    an opaque ``dict`` once validated.

    ``asset_id`` is a convenience alias: it is persisted verbatim in saved
    templates (so intent round-trips cleanly to the UI) and translated into
    the ``asset_id`` tag at the composition-root target resolver before the
    call reaches ``DM.list_devices``.
    """

    model_config = ConfigDict(extra="forbid")

    ids: list[str] | None = None
    types: list[str] | None = None
    tags: dict[str, list[str]] | None = None
    is_faulty: bool | None = None
    writable_attribute: str | None = None
    writable_attribute_type: DataType | None = None
    asset_id: str | None = None


class BatchDeviceCommand(BaseModel):
    """Request body for ``POST /devices/commands``.

    ``target`` is resolved server-side at dispatch time — callers may pass an
    explicit id list (``target.ids``), a filter (``types`` / ``tags`` / …), or
    both for an intersection.
    """

    target: DevicesFilterBody
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

    batch_id: str
    total: int
