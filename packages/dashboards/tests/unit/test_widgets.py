"""Unit tests for the widget registry and config models."""

from __future__ import annotations

import pytest
from dashboards.widgets import (
    ChartWidgetConfig,
    TextWidgetConfig,
    WidgetSize,
    WidgetType,
    build_default_registry,
)
from dashboards.widgets.registry import WidgetRegistry

from models.errors import InvalidError, NotFoundError


def test_default_registry_registers_built_in_types():
    registry = build_default_registry()

    assert set(registry.types()) == {"text", "chart"}
    assert registry.default_size("text") == WidgetSize(w=4, h=2)
    assert registry.default_size("chart") == WidgetSize(w=6, h=5)


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
        {"type": "chart", "attribute": "temperature"},  # missing device_id
        {"type": "chart", "device_id": "d1"},  # missing attribute
        {"type": "chart", "device_id": "", "attribute": "temperature"},  # empty
        {"type": "chart", "device_id": "d1", "attribute": ""},  # empty
        {  # extra key
            "type": "chart",
            "device_id": "d1",
            "attribute": "temperature",
            "agg": "avg",
        },
    ],
)
def test_validate_config_rejects_invalid(raw: dict):
    registry = build_default_registry()

    with pytest.raises(InvalidError):
        registry.validate_config(raw)


def test_get_unknown_type_raises():
    registry = build_default_registry()

    with pytest.raises(NotFoundError, match="Unknown widget type"):
        registry.get("kpi")


def test_validate_config_translates_unknown_type_to_invalid():
    # A direct registry miss is NotFound, but validating *user input* with an
    # unknown type is a bad request (InvalidError -> 422), not a 404.
    registry = build_default_registry()

    with pytest.raises(InvalidError, match="Unknown widget type"):
        registry.validate_config({"type": "kpi"})


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

    assert set(schemas) == {"text", "chart"}
    props = schemas["text"]["properties"]
    assert props["color"]["pattern"] == r"^#[0-9a-fA-F]{6}$"
    assert props["type"]["const"] == "text"
    chart = schemas["chart"]["properties"]
    assert set(schemas["chart"]["required"]) == {"device_id", "attribute"}
    # minLength must survive into the schema — it is what stops the editor
    # accepting its own empty-string seed as a valid config.
    assert chart["device_id"]["minLength"] == 1
    assert chart["attribute"]["minLength"] == 1
    # The editor previews a widget at the footprint it will be placed with, so
    # the size has to travel with the schema.
    assert schemas["chart"]["x-default-size"] == {"w": 6, "h": 5}
    assert schemas["text"]["x-default-size"] == {"w": 4, "h": 2}


def test_empty_registry_has_no_types():
    registry = WidgetRegistry()

    assert registry.types() == []
    assert registry.schemas() == {}


def test_validate_config_returns_chart_model():
    registry = build_default_registry()

    config = registry.validate_config(
        {"type": "chart", "device_id": "d1", "attribute": "temperature"}
    )

    assert isinstance(config, ChartWidgetConfig)
    assert config.device_id == "d1"
    assert config.attribute == "temperature"


@pytest.mark.parametrize("color", ["#000000", "#FFFFFF", "#1a2B3c"])
def test_text_config_accepts_valid_hex(color: str):
    config = TextWidgetConfig(text="x", color=color)

    assert config.color == color
