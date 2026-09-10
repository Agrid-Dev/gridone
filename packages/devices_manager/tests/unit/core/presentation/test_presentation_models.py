"""The v1 dialect: shapes, strictness, scalars and the JSON Schema it emits."""

import json
from typing import Any

import pytest
from pydantic import TypeAdapter, ValidationError

from devices_manager.core.presentation.models import (
    Anchor,
    AssetPath,
    Box,
    BoxAnchor,
    Capability,
    ColumnsNode,
    Condition,
    Deviation,
    DeviceFaceNode,
    DigitSpec,
    EqCondition,
    FaceLayer,
    GlyphSet,
    HexColor,
    LayerColor,
    LocalId,
    NumberSpec,
    PageNode,
    PresentationV1,
    RefAnchor,
    SectionNode,
    Size,
    TextPart,
)

from ..fixtures.presentations import FACE_LAYER_COUNT, put

LAYERS = "/page/items/1/content/children/0/layers"


def validate(annotation: object, value: object) -> Any:
    return TypeAdapter(annotation).validate_python(value)


def rejects(annotation: object, value: object) -> None:
    with pytest.raises(ValidationError):
        validate(annotation, value)


class TestThermostatDocument:
    def test_validates(self, thermostat_document):
        document = PresentationV1.model_validate(thermostat_document)
        assert isinstance(document.page, ColumnsNode)
        live = document.page.items[1].content
        assert isinstance(live, SectionNode)
        face = live.children[0]
        assert isinstance(face, DeviceFaceNode)
        assert len(face.layers) == FACE_LAYER_COUNT
        assert set(document.controls) == {"power", "target", "fan", "mode"}
        assert set(document.glyph_sets) == {"main", "montserrat"}

    def test_defaults(self):
        document = PresentationV1.model_validate(
            {
                "schema_version": 1,
                "requires": ["layout/1"],
                "page": {"kind": "attributes"},
            }
        )
        assert (document.assets, document.glyph_sets, document.bindings) == ({}, {}, {})
        assert document.controls == {}

    def test_json_schema_generates(self):
        schema = PresentationV1.model_json_schema()
        json.dumps(schema)
        assert set(schema["required"]) == {"schema_version", "requires", "page"}
        objects = [d for d in schema["$defs"].values() if d.get("type") == "object"]
        assert objects
        assert all(d.get("additionalProperties") is False for d in objects)
        assert schema["properties"]["page"]["discriminator"]["propertyName"] == "kind"


class TestStrictness:
    @pytest.mark.parametrize(
        "options",
        [
            {
                "collapsible": True,
                "collapsed": True,
                "appearance": "plain",
                "show_count": True,
            },
            {"collapsible": False, "collapsed": False, "appearance": "card"},
        ],
    )
    def test_section_options(self, options):
        section = SectionNode.model_validate(
            {
                "kind": "section",
                "title": {"default": "Settings"},
                "children": [],
                **options,
            }
        )
        assert section.model_dump(exclude_none=True) == {
            "kind": "section",
            "title": {"default": "Settings", "translations": {}},
            "children": [],
            **options,
        }

    @pytest.mark.parametrize(
        "options",
        [
            {"collapsed": True},
            {"collapsible": "true"},
            {"show_count": 1},
            {"appearance": "borderless"},
        ],
    )
    def test_invalid_section_options(self, options):
        rejects(
            SectionNode,
            {
                "kind": "section",
                "title": {"default": "Settings"},
                "children": [],
                **options,
            },
        )

    @pytest.mark.parametrize(
        "pointer",
        [
            "/extra",
            f"{LAYERS}/0/extra",
            f"{LAYERS}/1/visible_when/extra",
            f"{LAYERS}/2/anchor/extra",
            "/glyph_sets/main/cells/0/extra",
            "/controls/power/extra",
            "/bindings/power/extra",
        ],
    )
    def test_unknown_field_rejected(self, thermostat_document, pointer):
        put(thermostat_document, pointer, 1)
        with pytest.raises(ValidationError, match="Extra inputs are not permitted"):
            PresentationV1.model_validate(thermostat_document)

    def test_schema_version_must_be_one(self, thermostat_document):
        thermostat_document["schema_version"] = 2
        with pytest.raises(ValidationError, match="schema_version"):
            PresentationV1.model_validate(thermostat_document)


class TestScalars:
    @pytest.mark.parametrize("value", ["power", "a1", "icon_off", "x" * 64])
    def test_local_id_accepted(self, value):
        assert validate(LocalId, value) == value

    @pytest.mark.parametrize("value", ["Power", "1st", "a-b", "", "x" * 65, "é"])
    def test_local_id_rejected(self, value):
        rejects(LocalId, value)

    @pytest.mark.parametrize("value", ["layout/1", "device-face/12", "x/0"])
    def test_capability_accepted(self, value):
        assert validate(Capability, value) == value

    @pytest.mark.parametrize("value", ["Layout/1", "layout", "layout/x", "layout/1.0"])
    def test_capability_rejected(self, value):
        rejects(Capability, value)

    @pytest.mark.parametrize(
        ("value", "expected"),
        [("#bebebe", "#bebebe"), ("#BEBEBE", "#bebebe"), ("#3A3a3A", "#3a3a3a")],
    )
    def test_hex_color_normalised(self, value, expected):
        assert validate(HexColor, value) == expected

    @pytest.mark.parametrize("value", ["red", "#fff", "#ggggggg", "bebebe", "#bebebe "])
    def test_hex_color_rejected(self, value):
        rejects(HexColor, value)

    @pytest.mark.parametrize(
        "value", ["assets/case.png", "ui/atlas/digits.webp", "case.png", "a/b/c/d.png"]
    )
    def test_asset_path_accepted(self, value):
        assert validate(AssetPath, value) == value

    @pytest.mark.parametrize(
        "value",
        [
            "/case.png",
            "../case.png",
            "assets/../case.png",
            "assets/./case.png",
            "assets//case.png",
            ".hidden.png",
            "a/b/c/d/e.png",
            "case.PNG",
            "case.jpg",
            "case.png.exe",
            "boîtier.png",
            "assets\\case.png",
            "with space.png",
            "x" * 125 + ".png",
            "",
        ],
    )
    def test_asset_path_rejected(self, value):
        rejects(AssetPath, value)

    @pytest.mark.parametrize(
        "value",
        [
            {"x": "41", "y": 0, "width": 1, "height": 1},
            {"x": 41.5, "y": 0, "width": 1, "height": 1},
            {"x": True, "y": 0, "width": 1, "height": 1},
            {"x": 0, "y": 0, "width": -1, "height": 1},
            {"x": 0, "y": 0, "width": 1},
        ],
        ids=["string", "fraction", "bool", "negative_size", "missing"],
    )
    def test_box_rejected(self, value):
        rejects(Box, value)

    def test_box_accepts_negative_origin(self):
        assert validate(Box, {"x": -3, "y": -4, "width": 0, "height": 0}) == Box(
            x=-3, y=-4, width=0, height=0
        )

    @pytest.mark.parametrize(
        "value", [{"width": 0, "height": 5}, {"width": 5, "height": -1}]
    )
    def test_view_box_must_be_positive(self, value):
        rejects(Size, value)

    @pytest.mark.parametrize(
        "value",
        [
            {"minuend": "a", "subtrahend": "b", "tolerance": True},
            {"minuend": "a", "subtrahend": "b", "tolerance": -0.5},
            {"minuend": "a", "subtrahend": "b"},
        ],
        ids=["bool", "negative", "missing"],
    )
    def test_deviation_tolerance_rejected(self, value):
        rejects(Deviation, value)

    @pytest.mark.parametrize("decimals", [-1, 7, 1.5, "1"])
    def test_number_decimals_rejected(self, decimals):
        rejects(NumberSpec, {"binding": "b", "decimals": decimals})

    @pytest.mark.parametrize("chars", ["012345678", "0123456789A"])
    def test_digit_chars_must_map_ten_digits(self, chars):
        rejects(DigitSpec, {"binding": "b", "place": "tenths", "chars": chars})

    @pytest.mark.parametrize(
        "mutation",
        [
            lambda g: g["cells"].update({"ab": g["cells"]["0"]}),
            lambda g: g.update({"kerning": {"a": -1}}),
            lambda g: g.update({"line_height": 0}),
            lambda g: g["cells"]["0"].update({"x": -1}),
        ],
        ids=["two_char_cell", "one_char_pair", "zero_line_height", "negative_cell"],
    )
    def test_glyph_set_rejected(self, thermostat_document, mutation):
        glyph_set = thermostat_document["glyph_sets"]["main"]
        mutation(glyph_set)
        rejects(GlyphSet, glyph_set)


class TestUnions:
    @pytest.mark.parametrize(
        ("value", "expected_type"),
        [(True, bool), (1, int), (1.5, float), ("x", str), (0, int), (False, bool)],
    )
    def test_condition_operand_keeps_its_type(self, value, expected_type):
        condition = validate(Condition, {"op": "eq", "binding": "b", "value": value})
        assert isinstance(condition, EqCondition)
        assert type(condition.value) is expected_type

    @pytest.mark.parametrize(
        "value",
        [
            {"op": "between", "binding": "b", "value": 1},
            {"op": "not"},
            {"op": "all", "conditions": [{"op": "eq", "binding": "b"}]},
            {"op": "eq", "binding": "b", "value": [1]},
            {"op": "eq", "binding": "b", "value": None},
        ],
        ids=["unknown_op", "not_without_condition", "nested_error", "list", "null"],
    )
    def test_condition_rejected(self, value):
        rejects(Condition, value)

    def test_condition_nests(self):
        condition = validate(
            Condition,
            {
                "op": "all",
                "conditions": [
                    {"op": "not", "condition": {"op": "is_known", "binding": "a"}},
                    {
                        "op": "any",
                        "conditions": [
                            {"op": "in", "binding": "b", "values": [1, "x"]}
                        ],
                    },
                ],
            },
        )
        assert condition.conditions[1].conditions[0].values == [1, "x"]

    @pytest.mark.parametrize(
        ("value", "expected_type"),
        [
            (
                {"box": {"x": 0, "y": 0, "width": 1, "height": 1}, "align": "center"},
                BoxAnchor,
            ),
            ({"ref": "icon", "align": "out-right-mid", "dx": 3}, RefAnchor),
        ],
    )
    def test_anchor_kinds(self, value, expected_type):
        anchor = validate(Anchor, value)
        assert isinstance(anchor, expected_type)
        assert (anchor.dx, anchor.dy) == (value.get("dx", 0), 0)

    @pytest.mark.parametrize(
        ("value", "message"),
        [
            ({"align": "center"}, "either a box or a ref"),
            (
                {
                    "box": {"x": 0, "y": 0, "width": 1, "height": 1},
                    "ref": "a",
                    "align": "center",
                },
                "Extra inputs are not permitted",
            ),
            ({"ref": "a", "align": "middle"}, "Input should be"),
        ],
        ids=["neither", "both", "bad_align"],
    )
    def test_anchor_rejected(self, value, message):
        with pytest.raises(ValidationError, match=message):
            validate(Anchor, value)

    @pytest.mark.parametrize(
        "value",
        [
            {"literal": "°C"},
            {"digit": {"binding": "b", "place": "tens"}},
            {"number": {"binding": "b", "decimals": 1}},
            {"select": {"binding": "b", "cases": {"C": "°C"}, "default": "?"}},
        ],
    )
    def test_text_part_kinds(self, value):
        part = validate(TextPart, value)
        assert part.model_dump(exclude_none=True) == value

    @pytest.mark.parametrize(
        "value",
        [
            {"glyph": "x"},
            {"literal": "a", "number": {"binding": "b", "decimals": 1}},
            {},
            "x",
        ],
        ids=["unknown_key", "two_keys", "empty", "string"],
    )
    def test_text_part_rejected(self, value):
        with pytest.raises(ValidationError, match="a text part is one of"):
            validate(TextPart, value)

    def test_layer_color_kinds(self):
        assert validate(LayerColor, "#FFFFFF") == "#ffffff"
        conditional = validate(
            LayerColor,
            {
                "rules": [
                    {"when": {"op": "is_known", "binding": "b"}, "color": "#000000"}
                ],
                "default": "#ffffff",
            },
        )
        assert conditional.rules[0].color == "#000000"

    def test_unknown_layer_kind_rejected(self):
        with pytest.raises(
            ValidationError, match="does not match any of the expected tags"
        ):
            validate(
                FaceLayer,
                {"kind": "video", "box": {"x": 0, "y": 0, "width": 1, "height": 1}},
            )

    def test_glyph_text_has_no_box(self):
        with pytest.raises(ValidationError, match="Extra inputs are not permitted"):
            validate(
                FaceLayer,
                {
                    "kind": "glyph-text",
                    "glyph_set": "main",
                    "box": {"x": 0, "y": 0, "width": 1, "height": 1},
                    "anchor": {"ref": "a", "align": "center"},
                    "text": [],
                    "color": "#ffffff",
                },
            )

    def test_unknown_page_node_rejected(self):
        with pytest.raises(
            ValidationError, match="does not match any of the expected tags"
        ):
            validate(PageNode, {"kind": "tabs", "children": []})

    def test_setpoint_row_demanded_is_control_or_binding(self):
        with pytest.raises(ValidationError, match="either a control or a binding"):
            validate(
                PageNode,
                {
                    "kind": "setpoint-table",
                    "rows": [
                        {"label": {"default": "T"}, "demanded": {"attribute": "x"}}
                    ],
                },
            )
