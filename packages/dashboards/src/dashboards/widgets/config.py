from __future__ import annotations

from pydantic import BaseModel, ConfigDict


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
