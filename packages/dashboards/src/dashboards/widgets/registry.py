from __future__ import annotations

import logging
from dataclasses import asdict, dataclass
from typing import TYPE_CHECKING, Any

from pydantic import ValidationError

from dashboards.types import DASHBOARD_TYPES
from dashboards.widgets.chart import ChartWidgetConfig
from dashboards.widgets.config import InvalidWidgetConfig, WidgetSize
from dashboards.widgets.control_panel import ControlPanelWidgetConfig
from dashboards.widgets.device_control import DeviceControlWidgetConfig
from dashboards.widgets.kpi import KpiHistoryWidgetConfig, KpiLiveWidgetConfig
from dashboards.widgets.meter_tree import MeterTreeWidgetConfig
from dashboards.widgets.synoptic import SynopticWidgetConfig
from dashboards.widgets.text import TextWidgetConfig
from models.errors import InvalidError, NotFoundError

if TYPE_CHECKING:
    from collections.abc import Mapping

    from dashboards.types import DashboardType
    from dashboards.widgets.config import WidgetConfig

logger = logging.getLogger(__name__)

# Dashboard-fit vocabulary for widget registrations.
LIVE: frozenset[DashboardType] = frozenset({"live"})
HISTORY: frozenset[DashboardType] = frozenset({"history"})
ANY_DASHBOARD: frozenset[DashboardType] = frozenset(DASHBOARD_TYPES)


@dataclass(frozen=True)
class WidgetType:
    """A registered widget type: its discriminator, config model, the default
    grid size a freshly added widget of this type gets, and the dashboard
    types it fits (a chart reads over a period, so only a ``history``
    dashboard; a control panel reads the present, so only ``live``)."""

    type: str
    config_model: type[WidgetConfig]
    default_size: WidgetSize
    dashboard_types: frozenset[DashboardType]


class WidgetRegistry:
    """Registry of the widget types the service knows how to validate and size.

    The registry is the single source of truth for widget config schemas: it
    validates raw config into the right pydantic model, hands out each type's
    default size, and exposes the per-type JSON Schemas the UI forms consume.
    Adding a widget type is a matter of registering a :class:`WidgetType` — no
    branching on ``type`` elsewhere in the service.
    """

    def __init__(self) -> None:
        self._types: dict[str, WidgetType] = {}

    def register(self, widget_type: WidgetType) -> None:
        if widget_type.type in self._types:
            msg = f"Widget type {widget_type.type!r} is already registered"
            raise InvalidError(msg)
        self._types[widget_type.type] = widget_type

    def get(self, type_: str) -> WidgetType:
        """Look up a registered widget type. Raises :class:`NotFoundError`
        when the type is not registered."""
        widget_type = self._types.get(type_)
        if widget_type is None:
            msg = f"Unknown widget type {type_!r}"
            raise NotFoundError(msg)
        return widget_type

    def validate_config(self, raw: Mapping[str, Any]) -> WidgetConfig:
        """Validate a raw config mapping into its concrete config model.

        The ``type`` key selects the model; the rest is validated against it.
        Every failure — missing/unknown ``type`` or a schema violation — is
        surfaced as :class:`InvalidError` because this validates *user input*
        (an unknown ``type`` here is a bad request, not a missing resource).
        The underlying pydantic error is chained for the server log but kept
        out of the raised message.
        """
        type_ = raw.get("type")
        if not isinstance(type_, str):
            msg = "Widget config must carry a string 'type'"
            raise InvalidError(msg)
        try:
            widget_type = self.get(type_)
        except NotFoundError as exc:
            msg = f"Unknown widget type {type_!r}"
            raise InvalidError(msg) from exc
        try:
            return widget_type.config_model.model_validate(dict(raw))
        except ValidationError as exc:
            msg = f"Invalid config for widget type {type_!r}"
            raise InvalidError(msg) from exc

    def load_config(self, raw: Mapping[str, Any]) -> WidgetConfig:
        """Rebuild a *stored* config, tolerating one the registry rejects.

        Storage reads go through here rather than :meth:`validate_config`: a
        widget saved under a type or shape this build no longer knows must
        not make its whole dashboard unreadable. The failure is logged and
        the raw document comes back as :class:`InvalidWidgetConfig`, for the
        service to flag and the author to fix or remove.
        """
        try:
            return self.validate_config(raw)
        except InvalidError:
            type_ = raw.get("type")
            logger.warning("Stored widget config of type %r no longer validates", type_)
            document = dict(raw)
            if not isinstance(type_, str):
                document["type"] = "unknown"
            return InvalidWidgetConfig.model_validate(document)

    def accepts(self, type_: str, dashboard_type: DashboardType) -> bool:
        """Whether widgets of *type_* may sit on a *dashboard_type* dashboard."""
        return dashboard_type in self.get(type_).dashboard_types

    def default_size(self, type_: str) -> WidgetSize:
        return self.get(type_).default_size

    def schemas(self) -> dict[str, dict[str, Any]]:
        """Return a JSON Schema per registered type via ``model_json_schema``.

        Each schema carries the type's default size under the ``x-default-size``
        vendor extension and the dashboard types it fits under
        ``x-dashboard-types``. The registry owns both, so shipping them
        alongside the schema keeps one source of truth — the editor previews a
        widget at the footprint it will actually get and offers only the types
        the dashboard accepts, instead of guessing. Consumers that only
        validate ignore the extra keys.
        """
        return {
            t: {
                **wt.config_model.model_json_schema(),
                "x-default-size": asdict(wt.default_size),
                "x-dashboard-types": sorted(wt.dashboard_types),
            }
            for t, wt in self._types.items()
        }

    def types(self) -> list[str]:
        return list(self._types)


def build_default_registry() -> WidgetRegistry:
    """Build the registry with the built-in widget types registered.

    ``text`` is the placeholder widget at 4x2 grid cells. ``chart`` takes half
    the 12-column grid and enough rows to give the plot roughly the height it
    has on the device history page — a time axis squeezed into a small tile is
    unreadable. ``device_control`` is a third of the grid wide and tall,
    matching the portrait footprint of the standard control surface plus
    attribute panes on the device page. Both ``kpi`` variants are a sixth of
    the grid wide and a single row tall — they show one number, not a plot.
    ``control_panel`` shares the ``device_control`` footprint: a column of
    labelled rows, scrolling past that.

    Dashboard fit: the widgets reading the present (device cache, live
    aggregates) are ``live``-only; those reading timeseries over the viewing
    period are ``history``-only; ``text`` reads nothing and fits both.
    """
    registry = WidgetRegistry()
    registry.register(
        WidgetType(
            type="text",
            config_model=TextWidgetConfig,
            default_size=WidgetSize(w=4, h=2),
            dashboard_types=ANY_DASHBOARD,
        )
    )
    registry.register(
        WidgetType(
            type="chart",
            config_model=ChartWidgetConfig,
            default_size=WidgetSize(w=6, h=5),
            dashboard_types=HISTORY,
        )
    )
    registry.register(
        WidgetType(
            type="device_control",
            config_model=DeviceControlWidgetConfig,
            default_size=WidgetSize(w=4, h=6),
            dashboard_types=LIVE,
        )
    )
    registry.register(
        WidgetType(
            type="kpi_live",
            config_model=KpiLiveWidgetConfig,
            default_size=WidgetSize(w=2, h=1),
            dashboard_types=LIVE,
        )
    )
    registry.register(
        WidgetType(
            type="kpi_history",
            config_model=KpiHistoryWidgetConfig,
            default_size=WidgetSize(w=2, h=1),
            dashboard_types=HISTORY,
        )
    )
    registry.register(
        WidgetType(
            type="meter_tree",
            config_model=MeterTreeWidgetConfig,
            default_size=WidgetSize(w=6, h=8),
            dashboard_types=HISTORY,
        )
    )
    registry.register(
        WidgetType(
            type="control_panel",
            config_model=ControlPanelWidgetConfig,
            default_size=WidgetSize(w=4, h=6),
            dashboard_types=LIVE,
        )
    )
    registry.register(
        WidgetType(
            type="synoptic",
            config_model=SynopticWidgetConfig,
            default_size=WidgetSize(w=6, h=6),
            dashboard_types=LIVE,
        )
    )
    return registry
