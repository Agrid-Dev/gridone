"""Request and query schemas for the command-dispatch endpoints."""

from __future__ import annotations

from datetime import datetime

from fastapi import Query
from pydantic import BaseModel, ConfigDict

from commands import UnitCommand
from devices_manager.types import AttributeValueType
from models.targets import DevicesFilter
from models.types import SortOrder


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


def get_commands_query(
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
    """HTTP shape of a command target's device set.

    The wire form of :class:`models.targets.DevicesFilter`: the persisted
    criteria (``ids`` / ``types`` / ``tags``) plus the ``asset_id``
    convenience alias, folded into the ``asset_id`` tag by
    :meth:`to_devices_filter` at this boundary — assets are stored as device
    tags, and that translation lives at the composition layer so no service
    knows about it. What the services see and persist is always the strict
    canonical filter.

    Runtime query fields (``is_faulty``, ``writable_attribute``, ...) are
    deliberately not accepted in a target — like any unknown key they are
    rejected with 422 rather than silently altering the device set.
    Writability is enforced against the dispatched attribute by the resolver.
    """

    model_config = ConfigDict(extra="forbid")

    ids: list[str] | None = None
    types: list[str] | None = None
    tags: dict[str, list[str]] | None = None
    asset_id: str | None = None

    def to_devices_filter(self) -> DevicesFilter:
        """Canonicalize into the strict filter, folding ``asset_id`` into tags."""
        tags = self.tags
        if self.asset_id is not None:
            tags = dict(tags or {})
            values = list(tags.get("asset_id") or [])
            if self.asset_id not in values:
                values.append(self.asset_id)
            tags["asset_id"] = values
        return DevicesFilter(ids=self.ids, types=self.types, tags=tags)


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
    """Response body for accepted multi-device dispatches.

    Mirrors :class:`commands.BatchCommandDispatch`: the shared ``batch_id``
    and the PENDING unit commands the dispatch fanned out to. Clients can
    poll the commands history by ``batch_id`` to follow status changes.
    """

    batch_id: str
    commands: list[UnitCommand]
