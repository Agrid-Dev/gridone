"""Unit tests for the widget registry and config models."""

from __future__ import annotations

import pytest
from dashboards.widgets import (
    ChartWidgetConfig,
    DeviceControlWidgetConfig,
    KpiWidgetConfig,
    MeterTreeNode,
    MeterTreeWidgetConfig,
    TextWidgetConfig,
    WidgetSize,
    WidgetType,
    build_default_registry,
)
from dashboards.widgets.meter_tree import MAX_DEPTH, MAX_NODES
from dashboards.widgets.registry import WidgetRegistry
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
        "kpi",
        "meter_tree",
    }
    assert registry.default_size("text") == WidgetSize(w=4, h=2)
    assert registry.default_size("chart") == WidgetSize(w=6, h=5)
    assert registry.default_size("device_control") == WidgetSize(w=4, h=6)
    assert registry.default_size("kpi") == WidgetSize(w=2, h=1)
    assert registry.default_size("meter_tree") == WidgetSize(w=6, h=8)


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
        {  # a types filter is not an explicit single device
            "type": "kpi",
            "target": {
                "devices": {"types": ["thermostat"]},
                "attribute": "temperature",
            },
        },
        {  # a tags filter is not an explicit single device
            "type": "kpi",
            "target": {
                "devices": {"tags": {"floor": ["1"]}},
                "attribute": "temperature",
            },
        },
        {  # more than one explicit id is not single-device
            "type": "kpi",
            "target": {"devices": {"ids": ["d1", "d2"]}, "attribute": "temperature"},
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

    assert set(schemas) == {"text", "chart", "device_control", "kpi", "meter_tree"}
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
    assert set(kpi["required"]) == {"devices", "attributes"}
    assert kpi["x-default-size"] == {"w": 2, "h": 1}
    meter_tree = schemas["meter_tree"]
    assert set(meter_tree["required"]) == {"root"}
    assert meter_tree["x-default-size"] == {"w": 6, "h": 8}


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


def test_chart_config_defaults_to_an_automatic_interval():
    # Charts stored before the width was pinnable keep resolving it server-side.
    registry = build_default_registry()

    config = registry.validate_config(
        {
            "type": "chart",
            "target": {"devices": {"ids": ["d1"]}, "attribute": "temperature"},
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
            "target": {"devices": {"ids": ["d1"]}, "attribute": "energy"},
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


def test_chart_config_accepts_a_group_by():
    registry = build_default_registry()

    config = registry.validate_config(
        {
            "type": "chart",
            "target": {"devices": {"types": ["thermostat"]}, "attribute": "temp"},
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
                "target": {"devices": {"ids": ["d1"]}, "attribute": "temperature"},
                "agg": "avg",
                "group_by": "floor",
            }
        )


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


def test_kpi_config_defaults_to_live():
    registry = build_default_registry()

    config = registry.validate_config(
        {
            "type": "kpi",
            "devices": _kpi_devices("d1"),
            "attributes": [_kpi_attribute("Temperature", "temperature")],
        }
    )

    assert isinstance(config, KpiWidgetConfig)
    assert config.temporal == "live"
    assert config.attributes[0].unit is None
    assert config.attributes[0].precision is None
    assert [t.attribute for t in config.targets()] == ["temperature"]


def test_kpi_config_rejects_the_pre_multi_attribute_shape():
    # No KPI widget was ever persisted in the single-target shape, so it is
    # never upgraded — only the current `devices`/`attributes` shape is
    # accepted.
    registry = build_default_registry()

    with pytest.raises(InvalidError):
        registry.validate_config(
            {
                "type": "kpi",
                "target": {"devices": _kpi_devices("d1"), "attribute": "energy"},
                "temporal": {"operator": "sum"},
                "unit": "kWh",
                "precision": 1,
            }
        )


def test_kpi_config_accepts_several_attributes():
    registry = build_default_registry()

    config = registry.validate_config(
        {
            "type": "kpi",
            "devices": _kpi_devices("d1"),
            "attributes": [
                _kpi_attribute("Temperature", "temperature", unit="°C"),
                _kpi_attribute("Setpoint", "setpoint_min", unit="°C"),
            ],
        }
    )

    assert isinstance(config, KpiWidgetConfig)
    assert [t.attribute for t in config.targets()] == ["temperature", "setpoint_min"]


def test_kpi_config_rejects_an_empty_attributes_list():
    registry = build_default_registry()

    with pytest.raises(InvalidError):
        registry.validate_config(
            {"type": "kpi", "devices": _kpi_devices("d1"), "attributes": []}
        )


def test_kpi_config_content_size_hint_grows_height_with_attribute_count():
    config = KpiWidgetConfig.model_validate(
        {
            "type": "kpi",
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
    config = KpiWidgetConfig.model_validate(
        {
            "type": "kpi",
            "devices": _kpi_devices("d1"),
            "attributes": [_kpi_attribute("Temperature", "temperature")],
        }
    )

    assert config.content_size_hint(WidgetSize(w=2, h=1)) == WidgetSize(w=2, h=1)


def test_kpi_config_rejects_a_multi_device_resolved_target():
    # Defense in depth: even a config with an explicit single id is refused
    # if resolution still yields more than one device.
    config = KpiWidgetConfig.model_validate(
        {
            "type": "kpi",
            "devices": _kpi_devices("d1"),
            "attributes": [_kpi_attribute("Temperature", "temperature")],
        }
    )
    resolved = [_resolved("temperature", ["d1", "d2"])]

    with pytest.raises(InvalidError, match="exactly one device"):
        config.validate_resolved(resolved)


def test_kpi_config_accepts_a_single_device_resolved_target():
    config = KpiWidgetConfig.model_validate(
        {
            "type": "kpi",
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
            "type": "kpi",
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
                "type": "kpi",
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
                "type": "kpi",
                "devices": _kpi_devices(None, criteria="meter"),
                "attributes": [_kpi_attribute("Power", "power")],
            }
        )


def test_kpi_config_with_space_agg_accepts_a_multi_device_resolved_target():
    config = KpiWidgetConfig.model_validate(
        {
            "type": "kpi",
            "devices": _kpi_devices(None, criteria="meter"),
            "attributes": [_kpi_attribute("Power", "power", space_agg="sum")],
        }
    )
    resolved = [_resolved("power", ["d1", "d2"])]

    config.validate_resolved(resolved)


def test_kpi_config_with_space_agg_rejects_an_empty_resolved_target():
    config = KpiWidgetConfig.model_validate(
        {
            "type": "kpi",
            "devices": _kpi_devices(None, criteria="meter"),
            "attributes": [_kpi_attribute("Power", "power", space_agg="sum")],
        }
    )
    resolved = [_resolved("power", [])]

    with pytest.raises(InvalidError, match="at least one device"):
        config.validate_resolved(resolved)


def test_kpi_config_validate_resolved_checks_each_attribute_independently():
    config = KpiWidgetConfig.model_validate(
        {
            "type": "kpi",
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
    assert [t.devices.ids for t in config.targets()] == [["main"], ["m1"], ["m2"]]


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
