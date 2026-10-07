"""Unit tests for the widget registry and config models."""

from __future__ import annotations

import pytest
from dashboards.widgets import (
    ChartWidgetConfig,
    ControlPanelWidgetConfig,
    DeviceControlWidgetConfig,
    InvalidWidgetConfig,
    KpiHistoryWidgetConfig,
    KpiLiveWidgetConfig,
    MeterTreeNode,
    MeterTreeWidgetConfig,
    SynopticWidgetConfig,
    TextWidgetConfig,
    WidgetSize,
    WidgetType,
    build_default_registry,
)
from dashboards.widgets.control_panel import (
    MAX_ATTRIBUTES_PER_SECTION,
    MAX_SECTIONS,
)
from dashboards.widgets.kpi import KpiWidgetConfig
from dashboards.widgets.meter_tree import MAX_DEPTH, MAX_NODES, MeterTreeVariant
from dashboards.widgets.registry import ANY_DASHBOARD, WidgetRegistry
from pydantic import ValidationError

from models.errors import InvalidError, NotFoundError
from models.targets import ResolvedTarget
from models.types import AggregationOperator, DataType


def test_default_registry_registers_built_in_types():
    registry = build_default_registry()

    assert set(registry.types()) == {
        "text",
        "chart",
        "device_control",
        "kpi_live",
        "kpi_history",
        "meter_tree",
        "control_panel",
        "synoptic",
    }
    assert registry.default_size("text") == WidgetSize(w=4, h=2)
    assert registry.default_size("chart") == WidgetSize(w=6, h=5)
    assert registry.default_size("device_control") == WidgetSize(w=4, h=6)
    assert registry.default_size("kpi_live") == WidgetSize(w=2, h=1)
    assert registry.default_size("kpi_history") == WidgetSize(w=2, h=1)
    assert registry.default_size("meter_tree") == WidgetSize(w=6, h=8)
    assert registry.default_size("control_panel") == WidgetSize(w=4, h=6)
    assert registry.default_size("synoptic") == WidgetSize(w=6, h=6)


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
        {"type": "chart"},  # missing targets
        {"type": "chart", "targets": []},  # nothing to plot
        {  # the single-target shape: migrated in storage, no longer accepted
            "type": "chart",
            "target": {"devices": {"ids": ["d1"]}, "attribute": "temperature"},
        },
        {  # the pre-target shape, likewise
            "type": "chart",
            "device_id": "d1",
            "attribute": "temperature",
        },
        {  # more targets than one chart may plot
            "type": "chart",
            "targets": [{"devices": {"ids": ["d1"]}, "attribute": "temperature"}] * 21,
        },
        {  # target present but empty attribute
            "type": "chart",
            "targets": [{"devices": {"ids": ["d1"]}, "attribute": ""}],
        },
        {  # runtime filter keys are not persisted criteria
            "type": "chart",
            "targets": [{"devices": {"search": "th"}, "attribute": "temperature"}],
        },
        {  # `raw` silently applies no operator — a chart would caption an agg
            # it never ran
            "type": "chart",
            "targets": [{"devices": {"ids": ["d1"]}, "attribute": "energy"}],
            "agg": "delta",
            "interval": "raw",
        },
        {  # `whole` reduces the period to the single point a KPI shows
            "type": "chart",
            "targets": [{"devices": {"ids": ["d1"]}, "attribute": "energy"}],
            "agg": "delta",
            "interval": "whole",
        },
        {  # not a width at all — refused before storage, not at render
            "type": "chart",
            "targets": [{"devices": {"ids": ["d1"]}, "attribute": "energy"}],
            "agg": "delta",
            "interval": "banana",
        },
        {  # a width with no operator to fill its buckets
            "type": "chart",
            "targets": [{"devices": {"ids": ["d1"]}, "attribute": "energy"}],
            "interval": "1d",
        },
        {  # bars span buckets, and a raw series has none
            "type": "chart",
            "targets": [{"devices": {"ids": ["d1"]}, "attribute": "energy"}],
            "mark": "bar",
        },
        {  # not a mark the chart knows how to draw
            "type": "chart",
            "targets": [{"devices": {"ids": ["d1"]}, "attribute": "energy"}],
            "agg": "delta",
            "mark": "scatter",
        },
        {"type": "device_control"},  # missing device_id
        {"type": "device_control", "device_id": ""},  # empty device_id
        {"type": "synoptic"},
        {"type": "synoptic", "synoptic_id": ""},
        {"type": "synoptic", "synoptic_id": "s1", "read_only": False},
        {"type": "synoptic", "synoptic_id": "s1", "projection": "3d"},
        {  # live-only widget: no period mode/operator to store
            "type": "device_control",
            "device_id": "d1",
            "agg": "avg",
        },
        {"type": "kpi_live", "attribute": "temperature"},  # missing target
        {  # the single-type shape with its temporal selector: migrated in
            # storage (0005), no longer accepted
            "type": "kpi",
            "devices": {"ids": ["d1"]},
            "attributes": [{"label": "T", "attribute": "temperature"}],
            "temporal": "live",
        },
        {  # a live KPI reads the present: no operator to store
            "type": "kpi_live",
            "devices": {"ids": ["d1"]},
            "attributes": [{"label": "T", "attribute": "temperature"}],
            "agg": "avg",
        },
        {  # a history KPI reduces the period: the operator is mandatory
            "type": "kpi_history",
            "devices": {"ids": ["d1"]},
            "attributes": [{"label": "T", "attribute": "temperature"}],
        },
        {  # not an operator
            "type": "kpi_history",
            "devices": {"ids": ["d1"]},
            "attributes": [{"label": "T", "attribute": "temperature"}],
            "agg": "banana",
        },
        {  # interval is not the widget's to store — same rule as chart
            "type": "kpi_history",
            "devices": {"ids": ["d1"]},
            "attributes": [{"label": "T", "attribute": "temperature"}],
            "agg": "sum",
            "interval": "1h",
        },
        {  # negative precision
            "type": "kpi_live",
            "devices": {"ids": ["d1"]},
            "attributes": [{"label": "T", "attribute": "temperature", "precision": -1}],
        },
        {  # a types filter is not an explicit single device
            "type": "kpi_live",
            "devices": {"types": ["thermostat"]},
            "attributes": [{"label": "T", "attribute": "temperature"}],
        },
        {  # a tags filter is not an explicit single device
            "type": "kpi_live",
            "devices": {"tags": {"floor": ["1"]}},
            "attributes": [{"label": "T", "attribute": "temperature"}],
        },
        {  # more than one explicit id is not single-device
            "type": "kpi_live",
            "devices": {"ids": ["d1", "d2"]},
            "attributes": [{"label": "T", "attribute": "temperature"}],
        },
    ],
)
def test_validate_config_rejects_invalid(raw: dict):
    registry = build_default_registry()

    with pytest.raises(InvalidError):
        registry.validate_config(raw)


@pytest.mark.parametrize(
    ("type_", "live", "history"),
    [
        ("text", True, True),
        ("chart", False, True),
        ("meter_tree", False, True),
        ("kpi_history", False, True),
        ("device_control", True, False),
        ("control_panel", True, False),
        ("synoptic", True, False),
        ("kpi_live", True, False),
    ],
)
def test_default_registry_declares_each_widget_type_dashboard_fit(
    type_: str, live: bool, history: bool
):
    # Widgets reading the present fit a live dashboard; those reading over
    # the viewing period fit a history one; text reads nothing and fits both.
    registry = build_default_registry()

    assert registry.accepts(type_, "live") is live
    assert registry.accepts(type_, "history") is history


def test_accepts_unknown_type_raises():
    with pytest.raises(NotFoundError, match="Unknown widget type"):
        build_default_registry().accepts("unknown", "live")


def test_load_config_returns_the_concrete_model_for_a_valid_document():
    registry = build_default_registry()

    config = registry.load_config({"type": "text", "text": "hi", "color": "#1a2b3c"})

    assert isinstance(config, TextWidgetConfig)


@pytest.mark.parametrize(
    ("raw", "expected_type"),
    [
        ({"type": "kpi", "temporal": "live"}, "kpi"),  # a type this build dropped
        ({"type": "chart", "target": {"x": 1}}, "chart"),  # a shape it changed
        ({"text": "hi"}, "unknown"),  # no type at all
    ],
    ids=["removed_type", "changed_shape", "no_type"],
)
def test_load_config_keeps_a_rejected_document_verbatim(raw: dict, expected_type: str):
    # A stored widget the registry no longer accepts must not fail the
    # dashboard it sits on: it loads as an InvalidWidgetConfig carrying the
    # raw document, so it round-trips unchanged and can still be removed.
    registry = build_default_registry()

    config = registry.load_config(raw)

    assert isinstance(config, InvalidWidgetConfig)
    assert config.type == expected_type
    assert config.model_dump() == {**raw, "type": expected_type}


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
                dashboard_types=ANY_DASHBOARD,
            )
        )


def test_schemas_returns_json_schema_per_type():
    registry = build_default_registry()

    schemas = registry.schemas()

    assert set(schemas) == {
        "text",
        "chart",
        "device_control",
        "kpi_live",
        "kpi_history",
        "meter_tree",
        "control_panel",
        "synoptic",
    }
    props = schemas["text"]["properties"]
    assert props["color"]["pattern"] == r"^#[0-9a-fA-F]{6}$"
    assert props["type"]["const"] == "text"
    chart = schemas["chart"]["properties"]
    assert set(schemas["chart"]["required"]) == {"targets"}
    # The nested target model travels with the schema so the editor can
    # build the picker form from it.
    assert "targets" in chart
    assert "AttributeTarget" in schemas["chart"].get("$defs", {})
    # The editor previews a widget at the footprint it will be placed with, so
    # the size has to travel with the schema.
    assert schemas["chart"]["x-default-size"] == {"w": 6, "h": 5}
    assert schemas["text"]["x-default-size"] == {"w": 4, "h": 2}
    # Likewise the dashboard fit: the editor offers only the types the
    # dashboard accepts.
    assert schemas["chart"]["x-dashboard-types"] == ["history"]
    assert schemas["control_panel"]["x-dashboard-types"] == ["live"]
    assert schemas["text"]["x-dashboard-types"] == ["history", "live"]
    device_control = schemas["device_control"]
    assert set(device_control["required"]) == {"device_id"}
    assert device_control["properties"]["device_id"]["minLength"] == 1
    assert device_control["x-default-size"] == {"w": 4, "h": 6}
    kpi_live = schemas["kpi_live"]
    assert set(kpi_live["required"]) == {"devices", "attributes"}
    assert kpi_live["x-default-size"] == {"w": 2, "h": 1}
    kpi_history = schemas["kpi_history"]
    assert set(kpi_history["required"]) == {"devices", "attributes", "agg"}
    assert kpi_history["x-default-size"] == {"w": 2, "h": 1}
    meter_tree = schemas["meter_tree"]
    assert set(meter_tree["required"]) == {"root"}
    assert meter_tree["x-default-size"] == {"w": 6, "h": 8}
    control_panel = schemas["control_panel"]
    assert set(control_panel["required"]) == {"sections"}
    assert control_panel["x-default-size"] == {"w": 4, "h": 6}
    synoptic = schemas["synoptic"]
    assert set(synoptic["required"]) == {"synoptic_id"}
    assert synoptic["properties"]["synoptic_id"]["minLength"] == 1
    assert synoptic["x-default-size"] == {"w": 6, "h": 6}


def test_synoptic_config_keeps_an_opaque_document_reference():
    config = build_default_registry().validate_config(
        {"type": "synoptic", "synoptic_id": "plate1"}
    )

    assert isinstance(config, SynopticWidgetConfig)
    assert config.synoptic_id == "plate1"
    assert config.attribute_targets() == []


@pytest.mark.parametrize(
    ("given", "expected"),
    [({}, "isometric"), ({"projection": "flat"}, "flat")],
    ids=["default", "flat"],
)
def test_synoptic_config_projection(given: dict, expected: str):
    """The widget draws the plate in its own projection, isometric unless the
    author asks for the plan: the choice never touches the stored document."""
    config = build_default_registry().validate_config(
        {"type": "synoptic", "synoptic_id": "plate1", **given}
    )

    assert isinstance(config, SynopticWidgetConfig)
    assert config.projection == expected


def test_empty_registry_has_no_types():
    registry = WidgetRegistry()

    assert registry.types() == []
    assert registry.schemas() == {}


def test_validate_config_returns_chart_model():
    registry = build_default_registry()

    config = registry.validate_config(
        {
            "type": "chart",
            "targets": [
                {
                    "devices": {"types": ["thermostat"]},
                    "attribute": "temperature",
                }
            ],
        }
    )

    assert isinstance(config, ChartWidgetConfig)
    assert config.targets[0].devices.types == ["thermostat"]
    assert config.targets[0].attribute == "temperature"


# Adding aggregation must not invalidate charts stored before it existed.
def test_chart_config_defaults_to_raw():
    config = ChartWidgetConfig.model_validate(
        {
            "type": "chart",
            "targets": [{"devices": {"ids": ["d1"]}, "attribute": "temperature"}],
        }
    )

    assert config.agg is None


def test_every_registered_widget_declares_its_targets():
    # The API layer validates ``config.attribute_targets()`` at save time; a widget
    # type whose config forgot to implement it would silently skip that
    # gate, so the contract is pinned for every registered type.
    registry = build_default_registry()

    for widget_type in registry.types():
        model = registry.get(widget_type).config_model
        assert callable(model.attribute_targets)

    chart = registry.validate_config(
        {
            "type": "chart",
            "targets": [{"devices": {"ids": ["d1"]}, "attribute": "temperature"}],
        }
    )
    assert [t.attribute for t in chart.attribute_targets()] == ["temperature"]
    text = registry.validate_config({"type": "text", "text": "hi", "color": "#1a2b3c"})
    assert text.attribute_targets() == []
    # device_control references a whole device, not attribute series — it is
    # deliberately target-free (missing device is a render-time error state).
    control = registry.validate_config({"type": "device_control", "device_id": "d1"})
    assert control.attribute_targets() == []


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
            "targets": [{"devices": {"ids": ["d1"]}, "attribute": "temperature"}],
            "agg": "avg",
        }
    )

    assert isinstance(config, ChartWidgetConfig)
    assert config.agg is AggregationOperator.AVG


def test_chart_config_defaults_to_a_line_mark():
    # Charts stored before bars existed keep drawing as they always have.
    registry = build_default_registry()

    config = registry.validate_config(
        {
            "type": "chart",
            "targets": [{"devices": {"ids": ["d1"]}, "attribute": "temperature"}],
        }
    )

    assert isinstance(config, ChartWidgetConfig)
    assert config.mark == "line"


def test_chart_config_accepts_bars_over_buckets():
    registry = build_default_registry()

    config = registry.validate_config(
        {
            "type": "chart",
            "targets": [{"devices": {"ids": ["d1"]}, "attribute": "energy"}],
            "agg": "delta",
            "interval": "1d",
            "mark": "bar",
        }
    )

    assert isinstance(config, ChartWidgetConfig)
    assert config.mark == "bar"


def test_chart_config_defaults_to_an_automatic_interval():
    # Charts stored before the width was pinnable keep resolving it server-side.
    registry = build_default_registry()

    config = registry.validate_config(
        {
            "type": "chart",
            "targets": [{"devices": {"ids": ["d1"]}, "attribute": "temperature"}],
            "agg": "avg",
        }
    )

    assert isinstance(config, ChartWidgetConfig)
    assert config.interval == "auto"


def test_chart_config_accepts_a_pinned_interval():
    registry = build_default_registry()

    config = registry.validate_config(
        {
            "type": "chart",
            "targets": [{"devices": {"ids": ["d1"]}, "attribute": "energy"}],
            "agg": "delta",
            "interval": "1d",
        }
    )

    assert isinstance(config, ChartWidgetConfig)
    assert config.interval == "1d"


def test_chart_config_rejects_an_unknown_operator():
    registry = build_default_registry()

    with pytest.raises(InvalidError):
        registry.validate_config(
            {
                "type": "chart",
                "targets": [{"devices": {"ids": ["d1"]}, "attribute": "temperature"}],
                "agg": "median",
            }
        )


def test_chart_config_accepts_a_space_operator():
    registry = build_default_registry()

    config = registry.validate_config(
        {
            "type": "chart",
            "targets": [
                {"devices": {"types": ["thermostat"]}, "attribute": "hvac_mode"}
            ],
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
                "targets": [{"devices": {"ids": ["d1"]}, "attribute": "temperature"}],
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
                "targets": [{"devices": {"ids": ["d1"]}, "attribute": "temperature"}],
                "agg": "avg",
                "space_agg": "delta",
            }
        )


def test_chart_config_accepts_a_group_by():
    registry = build_default_registry()

    config = registry.validate_config(
        {
            "type": "chart",
            "targets": [{"devices": {"types": ["thermostat"]}, "attribute": "temp"}],
            "agg": "avg",
            "space_agg": "avg",
            "group_by": "floor",
        }
    )

    assert isinstance(config, ChartWidgetConfig)
    assert config.group_by == "floor"


def test_chart_config_group_by_requires_space_agg():
    registry = build_default_registry()

    with pytest.raises(InvalidError):
        registry.validate_config(
            {
                "type": "chart",
                "targets": [{"devices": {"ids": ["d1"]}, "attribute": "temperature"}],
                "agg": "avg",
                "group_by": "floor",
            }
        )


_PUMP_CHART = {
    "type": "chart",
    "targets": [
        {"devices": {"ids": ["d1"]}, "attribute": "pump_1"},
        {"devices": {"ids": ["d1"]}, "attribute": "pump_2"},
    ],
}


def test_chart_config_plots_every_target():
    registry = build_default_registry()

    config = registry.validate_config(_PUMP_CHART)

    assert [t.attribute for t in config.attribute_targets()] == ["pump_1", "pump_2"]


def test_chart_config_space_agg_requires_a_single_target():
    # A space operator folds one device set into one series; which set it
    # would fold across several targets is undefined.
    registry = build_default_registry()

    with pytest.raises(InvalidError):
        registry.validate_config({**_PUMP_CHART, "agg": "avg", "space_agg": "avg"})


def test_chart_config_accepts_targets_of_one_data_type():
    config = ChartWidgetConfig.model_validate(_PUMP_CHART)

    config.validate_resolved([_resolved("pump_1", ["d1"]), _resolved("pump_2", ["d1"])])


def test_chart_config_refuses_targets_of_mixed_data_types():
    # Every target shares the chart's operator and its panel.
    config = ChartWidgetConfig.model_validate(_PUMP_CHART)
    boolean = ResolvedTarget(
        attribute="pump_2",
        device_ids=["d1"],
        data_type=DataType.BOOL,
        excluded_device_ids=[],
    )

    with pytest.raises(InvalidError, match="bool, float"):
        config.validate_resolved([_resolved("pump_1", ["d1"]), boolean])


@pytest.mark.parametrize("color", ["#000000", "#FFFFFF", "#1a2B3c"])
def test_text_config_accepts_valid_hex(color: str):
    config = TextWidgetConfig(text="x", color=color)

    assert config.color == color


def _kpi_devices(device_id: str | None, *, criteria: str | None = None) -> dict:
    return {"types": [criteria]} if criteria else {"ids": [device_id]}


def _kpi_attribute(label: str, attribute: str, **kwargs: object) -> dict:
    return {"label": label, "attribute": attribute, **kwargs}


def _resolved(attribute: str, device_ids: list[str]) -> ResolvedTarget:
    return ResolvedTarget(
        attribute=attribute,
        device_ids=device_ids,
        data_type=DataType.FLOAT,
        excluded_device_ids=[],
    )


def test_kpi_live_config_stores_no_operator():
    registry = build_default_registry()

    config = registry.validate_config(
        {
            "type": "kpi_live",
            "devices": _kpi_devices("d1"),
            "attributes": [_kpi_attribute("Temperature", "temperature")],
        }
    )

    assert isinstance(config, KpiLiveWidgetConfig)
    assert "agg" not in config.model_dump()
    assert config.attributes[0].unit is None
    assert config.attributes[0].precision is None
    assert [t.attribute for t in config.attribute_targets()] == ["temperature"]


def test_kpi_history_config_requires_and_keeps_the_operator():
    registry = build_default_registry()

    config = registry.validate_config(
        {
            "type": "kpi_history",
            "devices": _kpi_devices("d1"),
            "attributes": [_kpi_attribute("Energy", "energy", unit="kWh")],
            "agg": "delta",
        }
    )

    assert isinstance(config, KpiHistoryWidgetConfig)
    assert config.agg is AggregationOperator.DELTA
    # Both variants share the tile rules (device set, attributes, sizing).
    assert isinstance(config, KpiWidgetConfig)


def test_kpi_config_accepts_several_attributes():
    registry = build_default_registry()

    config = registry.validate_config(
        {
            "type": "kpi_live",
            "devices": _kpi_devices("d1"),
            "attributes": [
                _kpi_attribute("Temperature", "temperature", unit="°C"),
                _kpi_attribute("Setpoint", "setpoint_min", unit="°C"),
            ],
        }
    )

    assert isinstance(config, KpiWidgetConfig)
    assert [t.attribute for t in config.attribute_targets()] == [
        "temperature",
        "setpoint_min",
    ]


def test_kpi_config_rejects_an_empty_attributes_list():
    registry = build_default_registry()

    with pytest.raises(InvalidError):
        registry.validate_config(
            {"type": "kpi_live", "devices": _kpi_devices("d1"), "attributes": []}
        )


def test_kpi_config_content_size_hint_grows_height_with_attribute_count():
    config = KpiLiveWidgetConfig.model_validate(
        {
            "type": "kpi_live",
            "devices": _kpi_devices("d1"),
            "attributes": [
                _kpi_attribute("Temperature", "temperature"),
                _kpi_attribute("Humidity", "humidity"),
                _kpi_attribute("Pressure", "pressure"),
            ],
        }
    )

    assert config.content_size_hint(WidgetSize(w=2, h=1)) == WidgetSize(w=2, h=3)


def test_kpi_config_content_size_hint_keeps_default_for_one_attribute():
    config = KpiLiveWidgetConfig.model_validate(
        {
            "type": "kpi_live",
            "devices": _kpi_devices("d1"),
            "attributes": [_kpi_attribute("Temperature", "temperature")],
        }
    )

    assert config.content_size_hint(WidgetSize(w=2, h=1)) == WidgetSize(w=2, h=1)


def test_kpi_config_rejects_a_multi_device_resolved_target():
    # Defense in depth: even a config with an explicit single id is refused
    # if resolution still yields more than one device.
    config = KpiLiveWidgetConfig.model_validate(
        {
            "type": "kpi_live",
            "devices": _kpi_devices("d1"),
            "attributes": [_kpi_attribute("Temperature", "temperature")],
        }
    )
    resolved = [_resolved("temperature", ["d1", "d2"])]

    with pytest.raises(InvalidError, match="exactly one device"):
        config.validate_resolved(resolved)


def test_kpi_config_accepts_a_single_device_resolved_target():
    config = KpiLiveWidgetConfig.model_validate(
        {
            "type": "kpi_live",
            "devices": _kpi_devices("d1"),
            "attributes": [_kpi_attribute("Temperature", "temperature")],
        }
    )
    resolved = [_resolved("temperature", ["d1"])]

    config.validate_resolved(resolved)


def test_kpi_config_accepts_a_space_operator():
    registry = build_default_registry()

    config = registry.validate_config(
        {
            "type": "kpi_live",
            "devices": _kpi_devices(None, criteria="meter"),
            "attributes": [_kpi_attribute("Power", "power", space_agg="sum")],
        }
    )

    assert isinstance(config, KpiWidgetConfig)
    assert config.attributes[0].space_agg is AggregationOperator.SUM


def test_kpi_config_rejects_a_non_space_operator():
    registry = build_default_registry()

    with pytest.raises(InvalidError):
        registry.validate_config(
            {
                "type": "kpi_live",
                "devices": _kpi_devices(None, criteria="meter"),
                "attributes": [_kpi_attribute("Power", "power", space_agg="delta")],
            }
        )


def test_kpi_config_rejects_a_missing_space_agg_on_a_multi_device_set():
    # The device set can match more than one device, so an attribute with no
    # fold operator has nothing to collapse it to a single reading.
    registry = build_default_registry()

    with pytest.raises(InvalidError):
        registry.validate_config(
            {
                "type": "kpi_live",
                "devices": _kpi_devices(None, criteria="meter"),
                "attributes": [_kpi_attribute("Power", "power")],
            }
        )


def test_kpi_config_with_space_agg_accepts_a_multi_device_resolved_target():
    config = KpiLiveWidgetConfig.model_validate(
        {
            "type": "kpi_live",
            "devices": _kpi_devices(None, criteria="meter"),
            "attributes": [_kpi_attribute("Power", "power", space_agg="sum")],
        }
    )
    resolved = [_resolved("power", ["d1", "d2"])]

    config.validate_resolved(resolved)


def test_kpi_config_with_space_agg_rejects_an_empty_resolved_target():
    config = KpiLiveWidgetConfig.model_validate(
        {
            "type": "kpi_live",
            "devices": _kpi_devices(None, criteria="meter"),
            "attributes": [_kpi_attribute("Power", "power", space_agg="sum")],
        }
    )
    resolved = [_resolved("power", [])]

    with pytest.raises(InvalidError, match="at least one device"):
        config.validate_resolved(resolved)


def test_kpi_config_validate_resolved_checks_each_attribute_independently():
    config = KpiLiveWidgetConfig.model_validate(
        {
            "type": "kpi_live",
            "devices": _kpi_devices("d1"),
            "attributes": [
                _kpi_attribute("Temperature", "temperature"),
                _kpi_attribute("Humidity", "humidity"),
            ],
        }
    )
    resolved = [_resolved("temperature", ["d1"]), _resolved("humidity", ["d2", "d3"])]

    # The failing attribute is the second one; the message names it by its
    # label so a multi-attribute tile's error is actionable.
    with pytest.raises(InvalidError, match=r"Attribute 'Humidity'.*exactly one device"):
        config.validate_resolved(resolved)


def _meter(device_id: str, attribute: str = "active_energy") -> dict:
    return {"devices": {"ids": [device_id]}, "attribute": attribute}


def test_validate_config_returns_meter_tree_model():
    registry = build_default_registry()

    config = registry.validate_config(
        {
            "type": "meter_tree",
            "root": {
                "label": "Building",
                "meter": _meter("main"),
                "children": [
                    {"label": "HVAC", "meter": _meter("m1", "energy")},
                    {
                        "label": "Riser",
                        "children": [{"label": "Floor 1", "meter": _meter("m2")}],
                    },
                ],
            },
        }
    )

    assert isinstance(config, MeterTreeWidgetConfig)
    # An unmetered grouping node contributes no target, and the rest come out
    # parents-first so validate_resolved can name the node that failed.
    assert [t.devices.ids for t in config.attribute_targets()] == [
        ["main"],
        ["m1"],
        ["m2"],
    ]


def test_meter_tree_node_may_group_without_a_meter():
    # A riser feeding several floors is routinely unmetered itself.
    node = MeterTreeNode.model_validate(
        {"label": "Riser", "children": [{"label": "F1", "meter": _meter("m1")}]}
    )

    assert node.meter is None
    assert node.depth() == 2


@pytest.mark.parametrize(
    "target",
    [
        {"devices": {"ids": ["a", "b"]}, "attribute": "e"},
        {"devices": {"types": ["meter"]}, "attribute": "e"},
        {"devices": {}, "attribute": "e"},
    ],
    ids=["two_ids", "criteria_types", "no_ids"],
)
def test_meter_tree_node_requires_a_single_explicit_device(target: dict):
    # A node is one physical meter, so a criteria-based device set has no
    # meaning here however the installation exposes it.
    with pytest.raises(ValidationError) as exc:
        MeterTreeNode.model_validate({"label": "N", "meter": target})

    assert "exactly one explicit device id" in str(exc.value)


def test_meter_tree_node_rejects_an_empty_node():
    with pytest.raises(ValidationError) as exc:
        MeterTreeNode.model_validate({"label": "nothing"})

    assert "must have a meter or children" in str(exc.value)


def test_meter_tree_node_may_omit_its_label_when_it_has_a_meter():
    # The meter's attribute already names what the node measures; the view
    # borrows the attribute's label rather than making every node restate it.
    node = MeterTreeNode.model_validate({"meter": _meter("m1")})

    assert node.label is None


def test_meter_tree_group_requires_a_label():
    # An unmetered group has no attribute to borrow a name from.
    with pytest.raises(ValidationError) as exc:
        MeterTreeNode.model_validate({"children": [{"meter": _meter("m1")}]})

    assert "needs a label" in str(exc.value)


def test_meter_tree_names_an_unlabelled_node_by_its_attribute():
    config = MeterTreeWidgetConfig.model_validate(
        {"type": "meter_tree", "root": {"meter": _meter("gone", "lighting_energy")}}
    )

    with pytest.raises(InvalidError, match="'lighting_energy'"):
        config.validate_resolved(
            [
                ResolvedTarget(
                    attribute="lighting_energy",
                    device_ids=[],
                    data_type=DataType.FLOAT,
                    excluded_device_ids=[],
                )
            ]
        )


def test_meter_tree_reports_the_full_path_of_a_deep_error():
    # The editor pins each message to a field, so a fault three levels down
    # must not surface as a complaint about the root.
    with pytest.raises(ValidationError) as exc:
        MeterTreeWidgetConfig.model_validate(
            {
                "type": "meter_tree",
                "root": {
                    "label": "Building",
                    "meter": _meter("main"),
                    "children": [
                        {
                            "label": "Riser",
                            "meter": _meter("m1"),
                            "children": [{"label": "", "meter": _meter("m2")}],
                        }
                    ],
                },
            }
        )

    locs = [".".join(str(part) for part in e["loc"]) for e in exc.value.errors()]
    assert "root.children.0.children.0.label" in locs


def _nest(levels: int) -> dict:
    node = {"label": "leaf", "meter": _meter("d")}
    for i in range(levels):
        node = {"label": f"L{i}", "children": [node]}
    return node


@pytest.mark.parametrize(("depth", "ok"), [(MAX_DEPTH, True), (MAX_DEPTH + 1, False)])
def test_meter_tree_bounds_its_depth(depth: int, ok: bool):
    raw = {"type": "meter_tree", "root": _nest(depth - 1)}

    if ok:
        assert MeterTreeWidgetConfig.model_validate(raw).root.depth() == depth
    else:
        with pytest.raises(ValidationError, match="levels deep"):
            MeterTreeWidgetConfig.model_validate(raw)


def test_meter_tree_bounds_its_node_count():
    # Every node costs one aggregate query at render time, so the ceiling is
    # really a bound on one widget's request fan-out.
    children = [{"label": f"n{i}", "meter": _meter(f"d{i}")} for i in range(MAX_NODES)]

    with pytest.raises(ValidationError, match="nodes, the maximum"):
        MeterTreeWidgetConfig.model_validate(
            {"type": "meter_tree", "root": {"label": "root", "children": children}}
        )


def test_meter_tree_names_the_node_whose_target_does_not_resolve():
    config = MeterTreeWidgetConfig.model_validate(
        {
            "type": "meter_tree",
            "root": {
                "label": "Building",
                "meter": _meter("main"),
                "children": [{"label": "Lighting", "meter": _meter("gone")}],
            },
        }
    )

    with pytest.raises(InvalidError, match="'Lighting'"):
        config.validate_resolved(
            [
                ResolvedTarget(
                    attribute="active_energy",
                    device_ids=["main"],
                    data_type=DataType.FLOAT,
                    excluded_device_ids=[],
                ),
                ResolvedTarget(
                    attribute="active_energy",
                    device_ids=[],
                    data_type=DataType.FLOAT,
                    excluded_device_ids=[],
                ),
            ]
        )


def test_meter_tree_schema_is_recursive():
    # The editor builds its form from this schema via z.fromJSONSchema, which
    # needs the node to reference itself rather than be inlined to a fixed depth.
    schema = build_default_registry().schemas()["meter_tree"]

    children = schema["$defs"]["MeterTreeNode"]["properties"]["children"]
    assert children["items"] == {"$ref": "#/$defs/MeterTreeNode"}


def test_meter_tree_node_accepts_a_scale():
    # Counters arrive on differing scales — Wh beside kWh, or differing CT
    # ratios — and the tree cannot compare readings that are not in one unit.
    node = MeterTreeNode.model_validate(
        {"label": "In Wh", "meter": _meter("d1"), "scale": 0.001}
    )

    assert node.scale == 0.001


def test_meter_tree_node_defaults_to_no_calibration():
    assert (
        MeterTreeNode.model_validate({"label": "N", "meter": _meter("d1")}).scale == 1
    )


@pytest.mark.parametrize(
    "raw",
    [
        # A scale with no reading to apply it to is a mistake, not a no-op.
        {"label": "G", "children": [{"label": "C", "meter": _meter("d1")}], "scale": 2},
        {"label": "N", "meter": _meter("d1"), "scale": 0},
        {"label": "N", "meter": _meter("d1"), "scale": -1},
    ],
    ids=["no_meter", "zero", "negative"],
)
def test_meter_tree_node_rejects_a_meaningless_scale(raw: dict):
    with pytest.raises(ValidationError):
        MeterTreeNode.model_validate(raw)


@pytest.mark.parametrize("variant", list(MeterTreeVariant))
def test_meter_tree_accepts_a_variant(variant: MeterTreeVariant):
    config = MeterTreeWidgetConfig.model_validate(
        {"root": {"label": "N", "meter": _meter("d1")}, "variant": variant.value}
    )

    assert config.variant is variant


def test_meter_tree_stored_without_a_variant_is_the_default():
    # Trees saved before the field existed carry no variant and keep their look.
    config = MeterTreeWidgetConfig.model_validate(
        {"type": "meter_tree", "root": {"label": "N", "meter": _meter("d1")}}
    )

    assert config.variant is MeterTreeVariant.DEFAULT


def test_meter_tree_null_variant_is_the_default():
    # A client clearing the variant sends null: that is the default look.
    config = MeterTreeWidgetConfig.model_validate(
        {"root": {"label": "N", "meter": _meter("d1")}, "variant": None}
    )

    assert config.variant is MeterTreeVariant.DEFAULT


def test_meter_tree_rejects_an_unknown_variant():
    with pytest.raises(ValidationError, match="variant"):
        MeterTreeWidgetConfig.model_validate(
            {"root": {"label": "N", "meter": _meter("d1")}, "variant": "gas"}
        )


_PUMP_RUNNING = {"device_id": "pump1", "attribute": "running"}
_PUMP_FAULT = {"device_id": "pump1", "attribute": "fault", "label": "Pump fault"}
_SELECTOR = {
    "device_id": "plc",
    "attribute": "auto_mode",
    "value": False,
    "inactive_reason": "Selector is on auto",
}


def _bool_target(attribute: str = "running") -> ResolvedTarget:
    return ResolvedTarget(
        attribute=attribute,
        device_ids=["pump1"],
        data_type=DataType.BOOL,
        excluded_device_ids=[],
    )


def test_validate_config_returns_control_panel_model():
    registry = build_default_registry()

    config = registry.validate_config(
        {
            "type": "control_panel",
            "sections": [
                {
                    "title": "Pump 1",
                    "active_when": _SELECTOR,
                    "attributes": [_PUMP_RUNNING, _PUMP_FAULT],
                },
                {"attributes": [{"device_id": "pump2", "attribute": "running"}]},
            ],
        }
    )

    assert isinstance(config, ControlPanelWidgetConfig)
    first, second = config.sections
    assert first.title == "Pump 1"
    assert first.active_when is not None
    assert first.active_when.value is False
    assert first.active_when.inactive_reason == "Selector is on auto"
    assert [a.label for a in first.attributes] == [None, "Pump fault"]
    # Title and condition are both optional: a bare list of rows is a section.
    assert second.title is None
    assert second.active_when is None


@pytest.mark.parametrize(("raw", "expected"), [({}, False), ({"link": True}, True)])
def test_control_panel_row_links_to_its_device_only_when_asked(
    raw: dict, expected: bool
):
    config = ControlPanelWidgetConfig.model_validate(
        {"sections": [{"attributes": [{**_PUMP_RUNNING, **raw}]}]}
    )

    assert config.sections[0].attributes[0].link is expected


@pytest.mark.parametrize(
    ("raw", "expected"),
    [({}, "attribute"), ({"label_by": "device"}, "device")],
)
def test_control_panel_labels_rows_by_attribute_unless_told_otherwise(
    raw: dict, expected: str
):
    config = ControlPanelWidgetConfig.model_validate(
        {**raw, "sections": [{"attributes": [_PUMP_RUNNING]}]}
    )

    assert config.label_by == expected


def test_control_panel_condition_defaults_to_active_when_true():
    config = ControlPanelWidgetConfig.model_validate(
        {
            "sections": [
                {
                    "active_when": {"device_id": "plc", "attribute": "enabled"},
                    "attributes": [_PUMP_RUNNING],
                }
            ]
        }
    )

    condition = config.sections[0].active_when
    assert condition is not None
    assert condition.value is True
    assert condition.inactive_reason is None


@pytest.mark.parametrize(
    "raw",
    [
        {},  # missing sections
        {"sections": []},  # a panel with nothing on it
        {"sections": [{"title": "Empty", "attributes": []}]},  # empty section
        {"sections": [{"title": "", "attributes": [_PUMP_RUNNING]}]},  # blank title
        {  # a row is one explicit device, never a device set
            "sections": [
                {"attributes": [{"devices": {"ids": ["d1"]}, "attribute": "running"}]}
            ]
        },
        {"sections": [{"attributes": [{"device_id": "", "attribute": "running"}]}]},
        {"sections": [{"attributes": [{"device_id": "d1", "attribute": ""}]}]},
        {"sections": [{"attributes": [{**_PUMP_RUNNING, "label": ""}]}]},
        {"label_by": "section", "sections": [{"attributes": [_PUMP_RUNNING]}]},
        {"sections": [{"attributes": [{**_PUMP_RUNNING, "link": "yes"}]}]},
        {  # the condition compares against a boolean, nothing else
            "sections": [
                {
                    "active_when": {**_SELECTOR, "value": "on"},
                    "attributes": [_PUMP_RUNNING],
                }
            ]
        },
        {  # blank reason
            "sections": [
                {
                    "active_when": {**_SELECTOR, "inactive_reason": ""},
                    "attributes": [_PUMP_RUNNING],
                }
            ]
        },
        {"sections": [{"attributes": [_PUMP_RUNNING]}] * (MAX_SECTIONS + 1)},
        {
            "sections": [
                {"attributes": [_PUMP_RUNNING] * (MAX_ATTRIBUTES_PER_SECTION + 1)}
            ]
        },
    ],
)
def test_control_panel_config_rejects_invalid(raw: dict):
    with pytest.raises(ValidationError):
        ControlPanelWidgetConfig.model_validate(raw)


def test_control_panel_targets_cover_conditions_and_rows_across_devices():
    config = ControlPanelWidgetConfig.model_validate(
        {
            "sections": [
                {
                    "title": "Pump 1",
                    "active_when": _SELECTOR,
                    "attributes": [_PUMP_RUNNING, _PUMP_FAULT],
                },
                {"attributes": [{"device_id": "pump2", "attribute": "running"}]},
            ]
        }
    )

    assert [(t.devices.ids, t.attribute) for t in config.attribute_targets()] == [
        (["plc"], "auto_mode"),
        (["pump1"], "running"),
        (["pump1"], "fault"),
        (["pump2"], "running"),
    ]


def test_control_panel_accepts_boolean_resolved_targets():
    config = ControlPanelWidgetConfig.model_validate(
        {"sections": [{"active_when": _SELECTOR, "attributes": [_PUMP_RUNNING]}]}
    )

    config.validate_resolved([_bool_target("auto_mode"), _bool_target()])


@pytest.mark.parametrize(
    ("section", "non_bool_index", "named"),
    [
        (
            {"title": "Pump 1", "attributes": [_PUMP_RUNNING, _PUMP_FAULT]},
            1,
            "Section 'Pump 1' attribute 'Pump fault'",
        ),
        # An untitled section is named by position, an unlabelled row by its
        # attribute.
        ({"attributes": [_PUMP_RUNNING]}, 0, "Section 1 attribute 'running'"),
        (
            {"title": "Pump 1", "active_when": _SELECTOR, "attributes": [_PUMP_FAULT]},
            0,
            "Section 'Pump 1' condition",
        ),
    ],
)
def test_control_panel_names_the_reference_that_is_not_a_boolean(
    section: dict, non_bool_index: int, named: str
):
    config = ControlPanelWidgetConfig.model_validate({"sections": [section]})
    resolved = [_bool_target() for _ in config.attribute_targets()]
    resolved[non_bool_index] = ResolvedTarget(
        attribute="x",
        device_ids=["pump1"],
        data_type=DataType.FLOAT,
        excluded_device_ids=[],
    )

    with pytest.raises(InvalidError) as excinfo:
        config.validate_resolved(resolved)

    assert str(excinfo.value) == f"{named} must be a boolean, got float"
