"""Confirmed group commands reuse the command service and freeze recipient IDs."""

from dataclasses import dataclass
from time import monotonic

from pydantic import BaseModel, ConfigDict, Field

from api.schemas.command import BatchDispatchResponse, DevicesFilterBody
from api.targets import CompositeTargetResolver, resolve_devices
from commands import AttributeWrite, CommandsServiceInterface
from devices_manager import DevicesServiceInterface
from devices_manager.core.device_group import DeviceGroup
from devices_manager.core.driver import LocalizedText
from devices_manager.core.write_preview import DeviceWritePreview
from models.errors import InvalidError, NotFoundError
from models.ids import gen_id
from models.resource_conflict import ResourceConflictCode, ResourceConflictError
from models.targets import AttributeTarget, DevicesFilter
from models.types import AttributeValueType

PREVIEW_TTL_SECONDS = 600
MAX_PREVIEWS = 1000


class GroupCommandPrepare(BaseModel):
    model_config = ConfigDict(extra="forbid", allow_inf_nan=False)
    device_ids: list[str] | None = None
    target: DevicesFilterBody | None = None
    attribute: str = Field(min_length=1)
    value: AttributeValueType


class GroupCommandPreview(GroupCommandPrepare):
    token: str
    group_id: str
    group_name: str
    attribute_label: LocalizedText | None = None
    unit: str | None = None
    members: list[DeviceWritePreview]


class GroupCommandConfirm(BaseModel):
    model_config = ConfigDict(extra="forbid")
    token: str
    device_ids: list[str] = Field(min_length=1)


@dataclass
class _Preparation:
    user_id: str
    preview: GroupCommandPreview
    created: float
    consumed: bool = False
    response: BatchDispatchResponse | None = None


class GroupCommands:
    def __init__(
        self, dm: DevicesServiceInterface, commands: CommandsServiceInterface
    ) -> None:
        self.dm = dm
        self.commands = commands
        self._preparations: dict[str, _Preparation] = {}

    def prepare(
        self, group_id: str, body: GroupCommandPrepare, user_id: str
    ) -> GroupCommandPreview:
        """Take a read-only snapshot; nothing is queued or persisted as a command."""
        now = monotonic()
        self._preparations = {
            key: item
            for key, item in self._preparations.items()
            if now - item.created < PREVIEW_TTL_SECONDS
        }
        if len(self._preparations) >= MAX_PREVIEWS:
            del self._preparations[next(iter(self._preparations))]
        group = self.dm.get_group(group_id)
        attribute = next(
            (
                a
                for a in self.dm.get_driver(group.driver_id).attributes
                if a.name == body.attribute
            ),
            None,
        )
        preview = GroupCommandPreview(
            **body.model_dump(),
            token=gen_id(),
            group_id=group.id,
            group_name=group.name,
            attribute_label=attribute.label if attribute else None,
            unit=attribute.unit if attribute else None,
            members=[
                self.dm.preview_device_write(item, body.attribute, body.value)
                for item in self._recipient_ids(group, body)
            ],
        )
        self._preparations[preview.token] = _Preparation(user_id, preview, now)
        return preview

    def _recipient_ids(
        self, group: DeviceGroup, body: GroupCommandPrepare
    ) -> list[str]:
        """Resolve intersecting filters in the same snapshot, including empty IDs."""
        ids = set(group.device_ids)
        if body.target is not None:
            target = body.target.to_devices_filter()
            if target.group_id is not None and target.group_id != group.id:
                msg = "Preview target must reference the requested group"
                raise InvalidError(msg)
            target = target.model_copy(update={"group_id": group.id})
            ids.intersection_update(
                device.id for device in resolve_devices(self.dm, target)
            )
        if body.device_ids is not None:
            ids.intersection_update(body.device_ids)
        return [device_id for device_id in group.device_ids if device_id in ids]

    async def confirm(
        self, group_id: str, body: GroupCommandConfirm, user_id: str
    ) -> BatchDispatchResponse:
        """Validate and dispatch the snapshot once, under the membership lock.

        Added members never enter the batch. Removed or newly ineligible recipients
        invalidate the preparation and require a new preview and confirmation.
        Consuming before dispatch prevents duplicate writes even after cancellation.
        """
        async with self.dm.mutation_lock:
            item = self._preparations.get(body.token)
            if item is None or monotonic() - item.created >= PREVIEW_TTL_SECONDS:
                raise ResourceConflictError(
                    ResourceConflictCode.GROUP_PREVIEW_EXPIRED, []
                )
            if item.user_id != user_id or item.preview.group_id != group_id:
                msg = "Command preview not found"
                raise NotFoundError(msg)
            if item.response is not None:
                return item.response
            if item.consumed:
                raise ResourceConflictError(
                    ResourceConflictCode.GROUP_PREVIEW_EXPIRED, []
                )
            selected = list(dict.fromkeys(body.device_ids))
            eligible = {row.device_id for row in item.preview.members if row.eligible}
            if not set(selected) <= eligible:
                msg = "Recipients must be selected from the eligible preview members"
                raise InvalidError(msg)
            self._validate_members(item, selected)
            resolved = await CompositeTargetResolver(self.dm).resolve(
                AttributeTarget(
                    devices=DevicesFilter(ids=selected),
                    attribute=item.preview.attribute,
                ),
                writable=True,
            )
            item.consumed = True
            dispatch = await self.commands.dispatch_batch(
                target=DevicesFilter(ids=selected),
                write=AttributeWrite(
                    attribute=item.preview.attribute,
                    value=item.preview.value,
                    data_type=resolved.data_type,
                ),
                user_id=user_id,
                confirm=True,
            )
            item.response = BatchDispatchResponse(
                batch_id=dispatch.batch_id, commands=dispatch.commands
            )
            return item.response

    def _validate_members(self, item: _Preparation, selected: list[str]) -> None:
        group = self.dm.get_group(item.preview.group_id)
        for device_id in selected:
            if device_id not in group.device_ids:
                item.consumed = True
                raise ResourceConflictError(
                    ResourceConflictCode.GROUP_PREVIEW_CHANGED, []
                )
            try:
                device = self.dm.get_device(device_id)
                row = self.dm.preview_device_write(
                    device_id, item.preview.attribute, item.preview.value
                )
            except NotFoundError as exc:
                item.consumed = True
                raise ResourceConflictError(
                    ResourceConflictCode.GROUP_PREVIEW_CHANGED, []
                ) from exc
            if device.driver_id != group.driver_id or not row.eligible:
                item.consumed = True
                raise ResourceConflictError(
                    ResourceConflictCode.GROUP_PREVIEW_CHANGED, []
                )
