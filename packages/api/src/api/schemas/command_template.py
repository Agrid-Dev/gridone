"""Request / response schemas for the ``/commands/templates`` endpoints."""

from __future__ import annotations

from datetime import datetime
from typing import Any

from commands import (
    AttributeWrite,
    CommandTemplate,
    CommandTemplateCreate,
    CommandTemplatePatch,
)
from devices_manager.types import AttributeValueType
from models.types import DataType
from pydantic import BaseModel

from api.schemas.command import DevicesFilterBody


class AttributeWritePayload(BaseModel):
    """The ``what`` of a template: an attribute to set on a device."""

    attribute: str
    value: AttributeValueType
    data_type: DataType

    @classmethod
    def from_domain(cls, write: AttributeWrite) -> AttributeWritePayload:
        return cls(
            attribute=write.attribute,
            value=write.value,
            data_type=write.data_type,
        )

    def to_domain(self) -> AttributeWrite:
        return AttributeWrite(
            attribute=self.attribute,
            value=self.value,
            data_type=self.data_type,
        )


class CommandTemplateCreatePayload(BaseModel):
    """Request body for ``POST /commands/templates``.

    ``name`` is the saved-vs-ephemeral signal: a non-null name marks the
    template as user-saved; ``None`` (or omitted) creates an ephemeral
    template that is normally produced automatically by
    :meth:`CommandsService.dispatch_batch`.
    """

    target: DevicesFilterBody
    write: AttributeWritePayload
    name: str | None = None

    def to_domain(self) -> CommandTemplateCreate:
        return CommandTemplateCreate(
            target=self.target.model_dump(exclude_none=True),
            write=self.write.to_domain(),
            name=self.name,
        )


class CommandTemplateUpdatePayload(BaseModel):
    """Request body for ``PATCH /commands/templates/{id}``.

    All fields optional. Pydantic's ``model_fields_set`` lets the service
    distinguish "field omitted" from "field explicitly set to null" — the
    latter is meaningful for ``name`` (demote a saved template back to
    ephemeral).
    """

    target: DevicesFilterBody | None = None
    write: AttributeWritePayload | None = None
    name: str | None = None

    def to_domain(self) -> CommandTemplatePatch:
        # Constructing the patch from a kwargs dict carries
        # ``model_fields_set`` semantics through — only the fields the
        # client actually sent land in the diff. ``name`` is special: an
        # explicit ``null`` (demote to ephemeral) is distinct from omitted.
        diff: dict[str, Any] = {}
        if "target" in self.model_fields_set and self.target is not None:
            diff["target"] = self.target.model_dump(exclude_none=True)
        if "write" in self.model_fields_set and self.write is not None:
            diff["write"] = self.write.to_domain()
        if "name" in self.model_fields_set:
            diff["name"] = self.name
        return CommandTemplatePatch(**diff)


class CommandTemplateResponse(BaseModel):
    """Response body for ``GET /commands/templates/{id}`` and friends."""

    id: str
    name: str | None
    target: dict[str, Any]
    write: AttributeWritePayload
    created_at: datetime
    created_by: str

    @classmethod
    def from_domain(cls, template: CommandTemplate) -> CommandTemplateResponse:
        return cls(
            id=template.id,
            name=template.name,
            target=dict(template.target),
            write=AttributeWritePayload.from_domain(template.write),
            created_at=template.created_at,
            created_by=template.created_by,
        )
