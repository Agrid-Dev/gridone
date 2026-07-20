from __future__ import annotations

from datetime import datetime  # noqa: TC003
from typing import Any

from pydantic import BaseModel, ConfigDict, Field

from dashboards.widgets.config import WidgetConfig  # noqa: TC001


class Metadata(BaseModel):
    """Auditability payload carried by every read model (AGR-933).

    ``created_by`` / ``updated_by`` stay ``None`` until caller identity is
    threaded through from the controller layer; timestamps are stamped by the
    service on create and every mutation.
    """

    created_at: datetime
    updated_at: datetime
    created_by: str | None = None
    updated_by: str | None = None


class WidgetLayout(BaseModel):
    """Grid geometry of a single widget, in react-grid-layout cell units.

    Geometry lives on the widget (not in a separate dashboard-level array) so
    the "one layout item per widget" and "removing a widget removes its layout
    item" invariants are impossible to violate. The dashboard-level RGL
    ``layout`` array is projected from these at read time.
    """

    model_config = ConfigDict(extra="forbid")

    x: int = Field(ge=0)
    y: int = Field(ge=0)
    w: int = Field(ge=1)
    h: int = Field(ge=1)


class LayoutItem(WidgetLayout):
    """A widget's geometry tagged with its widget id (``i``).

    This is exactly react-grid-layout's ``Layout`` element shape
    (``{i, x, y, w, h}``) — serializable as-is to/from RGL. It is the input
    shape for ``update_layout`` and the element type of ``Dashboard.layout``.
    """

    i: str


class Widget(BaseModel):
    """A widget on a dashboard: a common envelope plus a per-type ``config``.

    ``config`` is a concrete :class:`WidgetConfig` subclass selected by its
    ``type`` discriminator; ``type`` is exposed as a read-only projection of
    ``config.type`` and is immutable after creation.
    """

    id: str
    title: str | None = None
    description: str | None = None
    config: WidgetConfig
    layout: WidgetLayout
    metadata: Metadata

    @property
    def type(self) -> str:
        return self.config.type


class Dashboard(BaseModel):
    """A dashboard document: metadata envelope plus its widgets.

    The react-grid-layout ``layout`` is derived from each widget's geometry, so
    it is never stored separately — read it via :attr:`layout`.
    """

    id: str
    name: str
    description: str | None = None
    widgets: list[Widget] = Field(default_factory=list)
    metadata: Metadata

    @property
    def layout(self) -> list[LayoutItem]:
        return [
            LayoutItem(i=w.id, x=w.layout.x, y=w.layout.y, w=w.layout.w, h=w.layout.h)
            for w in self.widgets
        ]


class DashboardSummary(BaseModel):
    """Lightweight dashboard read model returned by ``list`` — no widgets or
    layout, just the envelope needed to render a dashboard index."""

    id: str
    name: str
    description: str | None = None
    metadata: Metadata


class DashboardCreate(BaseModel):
    """Inputs for creating a dashboard."""

    model_config = ConfigDict(extra="forbid")

    name: str
    description: str | None = None


class DashboardPatch(BaseModel):
    """Partial update for a dashboard's envelope.

    ``model_fields_set`` drives the diff so an omitted field is left as-is; a
    field present with a value is applied. ``name`` is required on the resource,
    so setting it to ``None`` is rejected by the service.
    """

    model_config = ConfigDict(extra="forbid")

    name: str | None = None
    description: str | None = None


class WidgetPatch(BaseModel):
    """Partial update for a widget.

    ``config``, when present, is validated by the registry and must keep the
    widget's existing ``type`` — changing type is remove + add, not an update.
    ``model_fields_set`` distinguishes an omitted field from one set to ``None``
    (e.g. clearing a ``description``).
    """

    model_config = ConfigDict(extra="forbid")

    title: str | None = None
    description: str | None = None
    config: dict[str, Any] | None = None
