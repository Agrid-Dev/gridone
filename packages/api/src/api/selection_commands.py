"""Confirmed selection commands reuse the command service and freeze recipient IDs."""

from dataclasses import dataclass
from time import monotonic

from pydantic import BaseModel, ConfigDict, Field

from api.schemas.command import BatchDispatchResponse, DevicesFilterBody
from api.targets import CompositeTargetResolver, resolve_devices
from commands import AttributeWrite, CommandsServiceInterface
from devices_manager import DevicesServiceInterface
from devices_manager.core.driver import LocalizedText
from devices_manager.core.write_preview import DeviceWritePreview
from models.errors import InvalidError, NotFoundError
from models.ids import gen_id
from models.resource_conflict import ResourceConflictCode, ResourceConflictError
from models.targets import AttributeTarget, DevicesFilter
from models.types import AttributeValueType, DataType

PREVIEW_TTL_SECONDS = 600
MAX_PREVIEWS = 1000


class SelectionCommandPrepare(BaseModel):
    model_config = ConfigDict(extra="forbid", allow_inf_nan=False)
    device_ids: list[str] | None = None
    target: DevicesFilterBody
    attribute: str = Field(min_length=1)
    value: AttributeValueType


class SelectionCommandPreview(SelectionCommandPrepare):
    token: str
    attribute_label: LocalizedText | None = None
    unit: str | None = None
    members: list[DeviceWritePreview]


class SelectionCommandConfirm(BaseModel):
    model_config = ConfigDict(extra="forbid")
    token: str
    device_ids: list[str] = Field(min_length=1)


@dataclass
class _Preparation:
    user_id: str
    preview: SelectionCommandPreview
    created: float
    bindings: dict[str, tuple[str, DataType | None]]
    consumed: bool = False
    response: BatchDispatchResponse | None = None


class SelectionCommands:
    def __init__(
        self, dm: DevicesServiceInterface, commands: CommandsServiceInterface
    ) -> None:
        self.dm = dm
        self.commands = commands
        self._preparations: dict[str, _Preparation] = {}

    def prepare(
        self, body: SelectionCommandPrepare, user_id: str
    ) -> SelectionCommandPreview:
        """Take a read-only snapshot; nothing is queued or persisted as a command."""
        now = monotonic()
        self._preparations = {
            key: item
            for key, item in self._preparations.items()
            if now - item.created < PREVIEW_TTL_SECONDS
        }
        if len(self._preparations) >= MAX_PREVIEWS:
            del self._preparations[next(iter(self._preparations))]
        target = body.target.to_devices_filter()
        driver = self.dm.get_driver(target.driver_id) if target.driver_id else None
        attribute = (
            next((a for a in driver.attributes if a.name == body.attribute), None)
            if driver
            else None
        )
        preview = SelectionCommandPreview(
            **body.model_dump(),
            token=gen_id(),
            attribute_label=attribute.label if attribute else None,
            unit=attribute.unit if attribute else None,
            members=[
                self.dm.preview_device_write(item, body.attribute, body.value)
                for item in self._recipient_ids(body)
            ],
        )
        self._preparations[preview.token] = _Preparation(
            user_id,
            preview.model_copy(deep=True),
            now,
            {
                row.device_id: self._binding(row.device_id, preview.attribute)
                for row in preview.members
            },
        )
        return preview

    def _binding(self, device_id: str, attribute: str) -> tuple[str, DataType | None]:
        device = self.dm.get_device(device_id)
        definition = device.attributes.get(attribute)
        return device.driver_id, definition.data_type if definition else None

    def _recipient_ids(self, body: SelectionCommandPrepare) -> list[str]:
        target = body.target.to_devices_filter()
        return [
            device.id
            for device in resolve_devices(self.dm, target)
            if body.device_ids is None or device.id in body.device_ids
        ]

    async def confirm(
        self, body: SelectionCommandConfirm, user_id: str
    ) -> BatchDispatchResponse:
        """Validate and dispatch the snapshot once, under the devices mutation lock.

        Added members never enter the batch. Removed or newly ineligible recipients
        invalidate the preparation and require a new preview and confirmation.
        Consuming before dispatch prevents duplicate writes even after cancellation.
        """
        async with self.dm.mutation_lock:
            item = self._preparations.get(body.token)
            if item is None or monotonic() - item.created >= PREVIEW_TTL_SECONDS:
                raise ResourceConflictError(
                    ResourceConflictCode.COMMAND_PREVIEW_EXPIRED, []
                )
            if item.user_id != user_id:
                msg = "Command preview not found"
                raise NotFoundError(msg)
            if item.response is not None:
                return item.response
            if item.consumed:
                raise ResourceConflictError(
                    ResourceConflictCode.COMMAND_PREVIEW_EXPIRED, []
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
        target = item.preview.target.to_devices_filter()
        members = {device.id for device in resolve_devices(self.dm, target)}
        for device_id in selected:
            if device_id not in members:
                item.consumed = True
                raise ResourceConflictError(
                    ResourceConflictCode.COMMAND_PREVIEW_CHANGED, []
                )
            try:
                binding = self._binding(device_id, item.preview.attribute)
                row = self.dm.preview_device_write(
                    device_id, item.preview.attribute, item.preview.value
                )
            except NotFoundError as exc:
                item.consumed = True
                raise ResourceConflictError(
                    ResourceConflictCode.COMMAND_PREVIEW_CHANGED, []
                ) from exc
            if (binding != item.bindings[device_id]) or not row.eligible:
                item.consumed = True
                raise ResourceConflictError(
                    ResourceConflictCode.COMMAND_PREVIEW_CHANGED, []
                )
