from __future__ import annotations

from dataclasses import dataclass
from typing import TYPE_CHECKING, Any

from pydantic import ValidationError

from dashboards.widgets.text import TextWidgetConfig
from models.errors import InvalidError

if TYPE_CHECKING:
    from collections.abc import Mapping

    from dashboards.widgets.config import WidgetConfig


@dataclass(frozen=True)
class WidgetSize:
    """Default grid footprint of a widget type, in react-grid-layout units."""

    w: int
    h: int


@dataclass(frozen=True)
class WidgetType:
    """A registered widget type: its discriminator, config model, and the
    default grid size a freshly added widget of this type gets."""

    type: str
    config_model: type[WidgetConfig]
    default_size: WidgetSize


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
        widget_type = self._types.get(type_)
        if widget_type is None:
            msg = f"Unknown widget type {type_!r}"
            raise InvalidError(msg)
        return widget_type

    def validate_config(self, raw: Mapping[str, Any]) -> WidgetConfig:
        """Validate a raw config mapping into its concrete config model.

        The ``type`` key selects the model; the rest is validated against it.
        Raises :class:`InvalidError` for a missing/unknown ``type`` or any
        schema violation — the underlying pydantic error is chained for the
        server log but kept out of the raised message.
        """
        type_ = raw.get("type")
        if not isinstance(type_, str):
            msg = "Widget config must carry a string 'type'"
            raise InvalidError(msg)
        widget_type = self.get(type_)
        try:
            return widget_type.config_model.model_validate(dict(raw))
        except ValidationError as exc:
            msg = f"Invalid config for widget type {type_!r}"
            raise InvalidError(msg) from exc

    def default_size(self, type_: str) -> WidgetSize:
        return self.get(type_).default_size

    def schemas(self) -> dict[str, dict[str, Any]]:
        """Return a JSON Schema per registered type via ``model_json_schema``."""
        return {t: wt.config_model.model_json_schema() for t, wt in self._types.items()}

    def types(self) -> list[str]:
        return list(self._types)


def build_default_registry() -> WidgetRegistry:
    """Build the registry with the built-in widget types registered.

    ``text`` is the only type today — a placeholder widget at 4x2 grid cells.
    """
    registry = WidgetRegistry()
    registry.register(
        WidgetType(
            type="text",
            config_model=TextWidgetConfig,
            default_size=WidgetSize(w=4, h=2),
        )
    )
    return registry
