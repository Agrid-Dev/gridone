"""Confirmed selection commands reuse the command service and freeze recipient IDs."""

import hashlib
import json
from dataclasses import dataclass
from datetime import UTC, datetime
from time import monotonic

from pydantic import BaseModel, ConfigDict, Field

from api.schemas.command import BatchDispatchResponse, DevicesFilterBody
from api.targets import CompositeTargetResolver, resolve_devices
from commands import AttributeWrite, CommandsServiceInterface
from devices_manager import DevicesServiceInterface
from devices_manager.core.driver import LocalizedText
from devices_manager.core.write_preview import DeviceWritePreview
from models.attribute_metadata import LanguageTag
from models.command_confirmation import (
    UIConfirmationContext,
    WriteConsent,
)
from models.errors import InvalidError, NotFoundError
from models.ids import gen_id
from models.resource_conflict import ResourceConflictCode, ResourceConflictError
from models.targets import AttributeTarget, DevicesFilter
from models.types import AttributeValueType

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
    confirmation_language: LanguageTag | None = None
    acknowledge_unknown_operating_rules: bool = False


@dataclass
class _Preparation:
    user_id: str
    preview: SelectionCommandPreview
    created: float
    bindings: dict[str, str]
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

    def _binding(self, device_id: str, attribute: str) -> str:
        """Freeze the write contract and physical destination, excluding live values.

        An unchanged driver ID can acquire a different address, codec or unit.
        Hash the relevant configuration so these changes invalidate the preview,
        while device names, tags, telemetry and metadata timestamps do not.
        """
        device = self.dm.get_device(device_id)
        driver = self.dm.get_driver(device.driver_id)
        definition = device.attributes.get(attribute)
        contract = next((a for a in driver.attributes if a.name == attribute), None)
        payload = {
            "device": device.model_dump(
                mode="json", include={"driver_id", "transport_id", "config"}
            ),
            "driver": driver.model_dump(
                mode="json", include={"transport", "env", "device_config"}
            ),
            "attribute": contract.model_dump(
                mode="json",
                include={
                    "name",
                    "data_type",
                    "read",
                    "write",
                    "codecs",
                    "unit",
                    "write_constraints",
                    "write_rules",
                    "write_options",
                    "value_mapping",
                    "user_confirmation",
                },
            )
            if contract
            else None,
            "data_type": definition.data_type if definition else None,
        }
        canonical = json.dumps(payload, sort_keys=True, separators=(",", ":"))
        return hashlib.sha256(canonical.encode()).hexdigest()

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
            eligible = {
                row.device_id
                for row in item.preview.members
                if row.eligible
                or (body.acknowledge_unknown_operating_rules and row.consent_required)
            }
            if not set(selected) <= eligible:
                msg = "Recipients must be selected from the eligible preview members"
                raise InvalidError(msg)
            self._validate_members(
                item,
                selected,
                acknowledge_unknown=body.acknowledge_unknown_operating_rules,
            )
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
                consents=self._consents(item, selected, user_id)
                if body.acknowledge_unknown_operating_rules
                else None,
                **(
                    {
                        "ui_confirmations": self._confirmation_contexts(
                            item, selected, body.confirmation_language
                        )
                    }
                    if body.confirmation_language is not None
                    else {}
                ),
            )
            item.response = BatchDispatchResponse(
                batch_id=dispatch.batch_id, commands=dispatch.commands
            )
            return item.response

    @staticmethod
    def _consents(
        item: _Preparation, selected: list[str], user_id: str
    ) -> dict[str, WriteConsent]:
        return {
            row.device_id: WriteConsent(
                binding=row.policy_binding,
                requirement_ids=row.unknown_requirement_ids,
                actor_id=user_id,
                confirmed_at=datetime.now(UTC),
            )
            for row in item.preview.members
            if row.device_id in selected
            and row.policy_binding is not None
            and row.consent_required
        }

    @staticmethod
    def _confirmation_contexts(
        item: _Preparation, selected: list[str], language: str
    ) -> dict[str, UIConfirmationContext]:
        return {
            row.device_id: UIConfirmationContext(
                message=row.user_confirmation.resolve(language),
                language=language,
                previous_value=row.current_value,
                previous_value_known=row.current_value_known,
            )
            for row in item.preview.members
            if row.device_id in selected and row.user_confirmation is not None
        }

    def consume_unit_confirmation(
        self,
        token: str,
        user_id: str,
        device_id: str,
        attribute: str,
        value: AttributeValueType,
        language: str,
    ) -> UIConfirmationContext:
        """Consume UI evidence once, bound to this user, destination and value.

        This optional path never exempts a command from the service's live
        guards. Reusing an accepted token cannot enqueue another command.
        """
        item = self._unit_preparation(token, user_id, device_id, attribute, value)
        contexts = self._confirmation_contexts(item, [device_id], language)
        if device_id not in contexts:
            msg = "No UI confirmation was presented"
            raise InvalidError(msg)
        item.consumed = True
        return contexts[device_id]

    def consume_unit_consent(
        self,
        token: str,
        user_id: str,
        device_id: str,
        attribute: str,
        value: AttributeValueType,
        language: str,
    ) -> tuple[WriteConsent, UIConfirmationContext | None]:
        """Consume explicit human consent, bound to the preview's unknown rules.

        The actual write re-evaluates everything under its device lock. This
        evidence cannot authorize a new rule, a changed rule or a known denial.
        """
        item = self._unit_preparation(
            token, user_id, device_id, attribute, value, acknowledge_unknown=True
        )
        confirmations = self._consents(item, [device_id], user_id)
        if device_id not in confirmations:
            msg = "No unknown operating rule warning was presented"
            raise InvalidError(msg)
        item.consumed = True
        return confirmations[device_id], self._confirmation_contexts(
            item, [device_id], language
        ).get(device_id)

    def _unit_preparation(
        self,
        token: str,
        user_id: str,
        device_id: str,
        attribute: str,
        value: AttributeValueType,
        *,
        acknowledge_unknown: bool = False,
    ) -> _Preparation:
        """Validate the shared, single-use binding before consuming any consent."""
        item = self._preparations.get(token)
        if (
            item is None
            or item.consumed
            or monotonic() - item.created >= PREVIEW_TTL_SECONDS
        ):
            raise ResourceConflictError(
                ResourceConflictCode.COMMAND_PREVIEW_EXPIRED, []
            )
        if item.user_id != user_id:
            msg = "Command preview not found"
            raise NotFoundError(msg)
        if (
            item.preview.attribute != attribute
            or type(item.preview.value) is not type(value)
            or item.preview.value != value
            or [row.device_id for row in item.preview.members] != [device_id]
        ):
            raise ResourceConflictError(
                ResourceConflictCode.COMMAND_PREVIEW_CHANGED, []
            )
        self._validate_members(
            item, [device_id], acknowledge_unknown=acknowledge_unknown
        )
        return item

    def _validate_members(
        self,
        item: _Preparation,
        selected: list[str],
        *,
        acknowledge_unknown: bool = False,
    ) -> None:
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
            previous = next(
                member
                for member in item.preview.members
                if member.device_id == device_id
            )
            if (
                (binding != item.bindings[device_id])
                or not (
                    row.eligible
                    or (
                        acknowledge_unknown
                        and row.consent_required
                        and previous.consent_required
                    )
                )
                or row.policy_binding != previous.policy_binding
                or not set(row.unknown_requirement_ids)
                <= set(previous.unknown_requirement_ids)
                or row.warnings != previous.warnings
                or row.user_confirmation != previous.user_confirmation
            ):
                item.consumed = True
                raise ResourceConflictError(
                    ResourceConflictCode.COMMAND_PREVIEW_CHANGED, []
                )
