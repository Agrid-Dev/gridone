"""Unit tests for the widget registry and config models."""

from __future__ import annotations

import pytest
from dashboards.widgets import (
    TextWidgetConfig,
    WidgetSize,
    WidgetType,
    build_default_registry,
)
from dashboards.widgets.registry import WidgetRegistry

from models.errors import InvalidError


def test_default_registry_registers_text():
    registry = build_default_registry()

    assert registry.types() == ["text"]
    assert registry.default_size("text") == WidgetSize(w=4, h=2)


def test_validate_config_returns_concrete_model():
    registry = build_default_registry()

    config = registry.validate_config(
        {"type": "text", "text": "hi", "color": "#1a2b3c"}
    )

    assert isinstance(config, TextWidgetConfig)
    assert config.text == "hi"


@pytest.mark.parametrize(
    "raw",
    [
        {"text": "hi", "color": "#1a2b3c"},  # missing type
        {"type": 123, "text": "hi", "color": "#1a2b3c"},  # non-string type
        {"type": "unknown"},  # unknown type
        {"type": "text", "text": "hi", "color": "red"},  # bad color
        {"type": "text", "color": "#1a2b3c"},  # missing text
        {"type": "text", "text": "hi", "color": "#1a2b3c", "extra": 1},  # extra key
    ],
)
def test_validate_config_rejects_invalid(raw: dict):
    registry = build_default_registry()

    with pytest.raises(InvalidError):
        registry.validate_config(raw)


def test_get_unknown_type_raises():
    registry = build_default_registry()

    with pytest.raises(InvalidError, match="Unknown widget type"):
        registry.get("kpi")


def test_register_duplicate_type_raises():
    registry = build_default_registry()

    with pytest.raises(InvalidError, match="already registered"):
        registry.register(
            WidgetType(
                type="text",
                config_model=TextWidgetConfig,
                default_size=WidgetSize(w=1, h=1),
            )
        )


def test_schemas_returns_json_schema_per_type():
    registry = build_default_registry()

    schemas = registry.schemas()

    assert set(schemas) == {"text"}
    props = schemas["text"]["properties"]
    assert props["color"]["pattern"] == r"^#[0-9a-fA-F]{6}$"
    assert props["type"]["const"] == "text"


def test_empty_registry_has_no_types():
    registry = WidgetRegistry()

    assert registry.types() == []
    assert registry.schemas() == {}


@pytest.mark.parametrize("color", ["#000000", "#FFFFFF", "#1a2B3c"])
def test_text_config_accepts_valid_hex(color: str):
    config = TextWidgetConfig(text="x", color=color)

    assert config.color == color
