"""Device attribute metadata and acquired observations, independent of consumers."""

from __future__ import annotations

from typing import TYPE_CHECKING, Literal, Protocol

from pydantic import BaseModel

from models.types import AttributeValueType, DataType  # noqa: TC001 -- pydantic schema

if TYPE_CHECKING:
    from models.expressions import DeviceAttributeRef


class AttributeDefinition(BaseModel):
    data_type: DataType
    writable: bool
    max_age_seconds: float | None


class AttributeObservation(BaseModel):
    value: AttributeValueType | None = None
    validity: Literal["known", "unknown", "invalid"]


class AttributeInspector(Protocol):
    def __call__(self, reference: DeviceAttributeRef) -> AttributeDefinition | None: ...


class AttributeResolver(Protocol):
    def __call__(
        self, reference: DeviceAttributeRef, *, max_age_seconds: float | None = None
    ) -> AttributeObservation: ...
