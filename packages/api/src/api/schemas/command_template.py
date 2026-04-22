"""Request / response schemas for the ``/command-templates`` endpoints."""

from __future__ import annotations

from datetime import datetime
from typing import Any

from commands import AttributeWrite, CommandTemplate, CommandTemplateCreate
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
    """Request body for ``POST /command-templates``.

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


class CommandTemplateResponse(BaseModel):
    """Response body for ``GET /command-templates/{id}`` and friends."""

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
