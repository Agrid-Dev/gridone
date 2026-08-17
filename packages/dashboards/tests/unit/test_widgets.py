"""Unit tests for the widget registry and config models."""

from __future__ import annotations

import pytest
from dashboards.widgets import (
    ChartWidgetConfig,
    DeviceControlWidgetConfig,
    KpiWidgetConfig,
    TextWidgetConfig,
    TimeAggregation,
    WidgetSize,
    WidgetType,
    build_default_registry,
)
from dashboards.widgets.registry import WidgetRegistry

from models.errors import InvalidError, NotFoundError
from models.targets import ResolvedTarget
from models.types import AggregationOperator, DataType


def test_default_registry_registers_built_in_types():
    registry = build_default_registry()

    assert set(registry.types()) == {"text", "chart", "device_control", "kpi"}
    assert registry.default_size("text") == WidgetSize(w=4, h=2)
    assert registry.default_size("chart") == WidgetSize(w=6, h=5)
    assert registry.default_size("device_control") == WidgetSize(w=4, h=6)
    assert registry.default_size("kpi") == WidgetSize(w=3, h=2)


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
        {"type": "chart", "attribute": "temperature"},  # missing target
        {"type": "chart", "device_id": "d1"},  # legacy shape missing attribute
        {  # legacy shape with an empty device_id — never upgraded
            "type": "chart",
            "device_id": "",
            "attribute": "temperature",
        },
        {"type": "chart", "device_id": "d1", "attribute": ""},  # empty attribute
        {  # target present but empty attribute
            "type": "chart",
            "target": {"devices": {"ids": ["d1"]}, "attribute": ""},
        },
        {  # runtime filter keys are not persisted criteria
            "type": "chart",
            "target": {"devices": {"search": "th"}, "attribute": "temperature"},
        },
        {  # extra key — the bucket width is not the widget's to store
            "type": "chart",
            "target": {"devices": {"ids": ["d1"]}, "attribute": "temperature"},
            "interval": "1h",
        },
        {"type": "device_control"},  # missing device_id
        {"type": "device_control", "device_id": ""},  # empty device_id
        {  # live-only widget: no period mode/operator to store
            "type": "device_control",
            "device_id": "d1",
            "agg": "avg",
        },
        {"type": "kpi", "attribute": "temperature"},  # missing target
        {  # unknown temporal literal — only "live" or a TimeAggregation
            "type": "kpi",
            "target": {"devices": {"ids": ["d1"]}, "attribute": "temperature"},
            "temporal": "period",
        },
        {  # period mode needs an operator
            "type": "kpi",
            "target": {"devices": {"ids": ["d1"]}, "attribute": "temperature"},
            "temporal": {},
        },
        {  # negative precision
            "type": "kpi",
            "target": {"devices": {"ids": ["d1"]}, "attribute": "temperature"},
            "precision": -1,
        },
        {  # interval is not the widget's to store — same rule as chart
            "type": "kpi",
            "target": {"devices": {"ids": ["d1"]}, "attribute": "temperature"},
            "temporal": {"operator": "sum", "interval": "1h"},
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
        registry.get("unknown")


def test_validate_config_translates_unknown_type_to_invalid():
    # A direct registry miss is NotFound, but validating *user input* with an
    # unknown type is a bad request (InvalidError -> 422), not a 404.
    registry = build_default_registry()

    with pytest.raises(InvalidError, match="Unknown widget type"):
        registry.validate_config({"type": "unknown"})


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

    assert set(schemas) == {"text", "chart", "device_control", "kpi"}
    props = schemas["text"]["properties"]
    assert props["color"]["pattern"] == r"^#[0-9a-fA-F]{6}$"
    assert props["type"]["const"] == "text"
    chart = schemas["chart"]["properties"]
    assert set(schemas["chart"]["required"]) == {"target"}
    # The nested target model travels with the schema so the editor can
    # build the picker form from it.
    assert "target" in chart
    assert "AttributeTarget" in schemas["chart"].get("$defs", {})
    # The editor previews a widget at the footprint it will be placed with, so
    # the size has to travel with the schema.
    assert schemas["chart"]["x-default-size"] == {"w": 6, "h": 5}
    assert schemas["text"]["x-default-size"] == {"w": 4, "h": 2}
    device_control = schemas["device_control"]
    assert set(device_control["required"]) == {"device_id"}
    assert device_control["properties"]["device_id"]["minLength"] == 1
    assert device_control["x-default-size"] == {"w": 4, "h": 6}
    kpi = schemas["kpi"]
    assert set(kpi["required"]) == {"target"}
    assert kpi["x-default-size"] == {"w": 3, "h": 2}


def test_empty_registry_has_no_types():
    registry = WidgetRegistry()

    assert registry.types() == []
    assert registry.schemas() == {}


def test_validate_config_returns_chart_model():
    registry = build_default_registry()

    config = registry.validate_config(
        {
            "type": "chart",
            "target": {
                "devices": {"types": ["thermostat"]},
                "attribute": "temperature",
            },
        }
    )

    assert isinstance(config, ChartWidgetConfig)
    assert config.target.devices.types == ["thermostat"]
    assert config.target.attribute == "temperature"


# Charts persisted before the target model must keep loading: configs are
# re-validated on read, so the legacy shape upgrades in place of a migration.
def test_chart_config_upgrades_legacy_single_device_shape():
    registry = build_default_registry()

    config = registry.validate_config(
        {"type": "chart", "device_id": "d1", "attribute": "temperature", "agg": "avg"}
    )

    assert isinstance(config, ChartWidgetConfig)
    assert config.target.devices.ids == ["d1"]
    assert config.target.attribute == "temperature"
    assert config.agg is AggregationOperator.AVG
    # The upgraded form is what serializes — new saves persist the target shape.
    assert "device_id" not in config.model_dump()


# Adding aggregation must not invalidate charts stored before it existed.
def test_chart_config_defaults_to_raw():
    config = ChartWidgetConfig.model_validate(
        {"type": "chart", "device_id": "d1", "attribute": "temperature"}
    )

    assert config.agg is None


def test_every_registered_widget_declares_its_targets():
    # The API layer validates ``config.targets()`` at save time; a widget
    # type whose config forgot to implement it would silently skip that
    # gate, so the contract is pinned for every registered type.
    registry = build_default_registry()

    for widget_type in registry.types():
        model = registry.get(widget_type).config_model
        assert callable(model.targets)

    chart = registry.validate_config(
        {
            "type": "chart",
            "target": {"devices": {"ids": ["d1"]}, "attribute": "temperature"},
        }
    )
    assert [t.attribute for t in chart.targets()] == ["temperature"]
    text = registry.validate_config({"type": "text", "text": "hi", "color": "#1a2b3c"})
    assert text.targets() == []
    # device_control references a whole device, not attribute series — it is
    # deliberately target-free (missing device is a render-time error state).
    control = registry.validate_config({"type": "device_control", "device_id": "d1"})
    assert control.targets() == []


def test_validate_config_returns_device_control_model():
    registry = build_default_registry()

    config = registry.validate_config({"type": "device_control", "device_id": "d1"})

    assert isinstance(config, DeviceControlWidgetConfig)
    assert config.device_id == "d1"


def test_chart_config_accepts_an_operator():
    registry = build_default_registry()

    # Validated from the wire form a stored config actually takes.
    config = registry.validate_config(
        {
            "type": "chart",
            "target": {"devices": {"ids": ["d1"]}, "attribute": "temperature"},
            "agg": "avg",
        }
    )

    assert isinstance(config, ChartWidgetConfig)
    assert config.agg is AggregationOperator.AVG


def test_chart_config_rejects_an_unknown_operator():
    registry = build_default_registry()

    with pytest.raises(InvalidError):
        registry.validate_config(
            {
                "type": "chart",
                "target": {"devices": {"ids": ["d1"]}, "attribute": "temperature"},
                "agg": "median",
            }
        )


def test_chart_config_accepts_a_space_operator():
    registry = build_default_registry()

    config = registry.validate_config(
        {
            "type": "chart",
            "target": {"devices": {"types": ["thermostat"]}, "attribute": "hvac_mode"},
            "agg": "mode",
            "space_agg": "mode",
        }
    )

    assert isinstance(config, ChartWidgetConfig)
    assert config.space_agg is AggregationOperator.MODE


def test_chart_config_space_agg_requires_agg():
    registry = build_default_registry()

    with pytest.raises(InvalidError):
        registry.validate_config(
            {
                "type": "chart",
                "target": {"devices": {"ids": ["d1"]}, "attribute": "temperature"},
                "space_agg": "avg",
            }
        )


def test_chart_config_rejects_a_non_space_operator():
    # first/last/delta/tw_* need an ordering or a duration a device set does
    # not have; refused at save rather than at render.
    registry = build_default_registry()

    with pytest.raises(InvalidError):
        registry.validate_config(
            {
                "type": "chart",
                "target": {"devices": {"ids": ["d1"]}, "attribute": "temperature"},
                "agg": "avg",
                "space_agg": "delta",
            }
        )


@pytest.mark.parametrize("color", ["#000000", "#FFFFFF", "#1a2B3c"])
def test_text_config_accepts_valid_hex(color: str):
    config = TextWidgetConfig(text="x", color=color)

    assert config.color == color


def test_kpi_config_defaults_to_live():
    registry = build_default_registry()

    config = registry.validate_config(
        {
            "type": "kpi",
            "target": {"devices": {"ids": ["d1"]}, "attribute": "temperature"},
        }
    )

    assert isinstance(config, KpiWidgetConfig)
    assert config.temporal == "live"
    assert config.unit is None
    assert config.precision is None
    assert [t.attribute for t in config.targets()] == ["temperature"]


def test_kpi_config_accepts_a_period_aggregation():
    registry = build_default_registry()

    config = registry.validate_config(
        {
            "type": "kpi",
            "target": {"devices": {"ids": ["d1"]}, "attribute": "energy"},
            "temporal": {"operator": "sum"},
            "unit": "kWh",
            "precision": 1,
        }
    )

    assert isinstance(config, KpiWidgetConfig)
    assert isinstance(config.temporal, TimeAggregation)
    assert config.temporal.operator is AggregationOperator.SUM
    assert config.unit == "kWh"
    assert config.precision == 1


def test_kpi_config_rejects_a_multi_device_resolved_target():
    config = KpiWidgetConfig.model_validate(
        {
            "type": "kpi",
            "target": {
                "devices": {"types": ["thermostat"]},
                "attribute": "temperature",
            },
        }
    )
    resolved = [
        ResolvedTarget(
            attribute="temperature",
            device_ids=["d1", "d2"],
            data_type=DataType.FLOAT,
            excluded_device_ids=[],
        )
    ]

    with pytest.raises(InvalidError, match="exactly one device"):
        config.validate_resolved(resolved)


def test_kpi_config_accepts_a_single_device_resolved_target():
    config = KpiWidgetConfig.model_validate(
        {
            "type": "kpi",
            "target": {"devices": {"ids": ["d1"]}, "attribute": "temperature"},
        }
    )
    resolved = [
        ResolvedTarget(
            attribute="temperature",
            device_ids=["d1"],
            data_type=DataType.FLOAT,
            excluded_device_ids=[],
        )
    ]

    config.validate_resolved(resolved)
