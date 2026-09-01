from __future__ import annotations

from dataclasses import dataclass
from typing import TYPE_CHECKING

from pydantic import BaseModel, ConfigDict

from models.types import SPACE_AGGREGATION_OPERATORS

if TYPE_CHECKING:
    from models.targets import AttributeTarget, ResolvedTarget
    from models.types import AggregationOperator


@dataclass(frozen=True)
class WidgetSize:
    """A grid footprint, in react-grid-layout units."""

    w: int
    h: int


def validate_space_agg_membership(space_agg: AggregationOperator) -> None:
    """Raise unless *space_agg* is in the space aggregation vocabulary.

    Shared by every widget config that offers a ``space_agg`` field; dtype
    compatibility is checked separately, at read time.
    """
    if space_agg not in SPACE_AGGREGATION_OPERATORS:
        msg = f"Operator '{space_agg}' is not a space aggregation operator"
        raise ValueError(msg)


class WidgetConfig(BaseModel):
    """Base class for every widget type's config model.

    Each concrete widget type subclasses this and pins ``type`` to a
    ``Literal`` so it acts as the discriminator of the widget-config union and
    flows into the generated JSON Schema. ``extra="forbid"`` turns unknown keys
    into a validation error, so a malformed config is rejected before anything
    is persisted.

    The service never types a field as a concrete config; it holds a
    ``WidgetConfig`` and lets the registry validate raw input into the right
    subclass. Concrete instances round-trip losslessly because serialization
    calls ``model_dump`` on the instance (not on this base), and pydantic
    accepts an already-built subclass instance without revalidating it away.
    """

    model_config = ConfigDict(extra="forbid")

    type: str

    def targets(self) -> list[AttributeTarget]:
        """The attribute targets this widget reads.

        The API layer resolves them at save time (zero coverage and mixed
        data types are authoring errors); the dashboards service itself
        never does — it stays document-only. Widgets that read device data
        override this; the default is no targets.
        """
        return []

    def validate_resolved(self, resolved: list[ResolvedTarget]) -> None:  # noqa: ARG002
        """Extra save-time checks on resolved targets; no-op by default."""
        return

    def content_size_hint(self, default_size: WidgetSize) -> WidgetSize:
        """Minimum footprint this instance's content needs; no-op by default."""
        return default_size
