"""Resolution of the thermostat document: clean as shipped, and every
semantic rule caught with a located diagnostic when the document is bent."""

from collections.abc import Callable
from typing import Any

import pytest

from devices_manager.core.presentation import (
    DOCUMENT_BUDGETS,
    AvailablePresentation,
    DiagnosticCode,
    PresentationEnvelope,
    UnavailablePresentation,
    check_semantics,
    validate_presentation,
)
from devices_manager.core.presentation.models import PresentationV1

from ..fixtures.presentations import (
    CONTROL_PANEL_PATH,
    FACE_PATH,
    LAYERS_PATH,
    MEASUREMENTS_PATH,
    SETPOINT_TABLE_PATH,
    put,
)

Mutation = Callable[[dict[str, Any]], None]

# Layers of the face, as transcribed from face.ts (see the fixture YAML).
SCREEN_RECT = 1
TENS_DIGIT = 2
TENTHS_DIGIT = 4
ICON_POWER = 10
TOP_LEFT_TEMPERATURE_TEXT = 14
BUTTON_OFF = 22
BUTTON_MODE = 24
BUTTON_PLUS = 25
BUTTON_MINUS = 26
LOCK_POWER = 27
BUTTON_ON = 33


def layer(index: int) -> str:
    return f"{LAYERS_PATH}/{index}"


def nested_not(depth: int) -> dict[str, Any]:
    """A ``not`` chain ``depth`` conditions deep ending on ``is_known power``."""
    condition: dict[str, Any] = {"op": "is_known", "binding": "power"}
    for _ in range(depth - 1):
        condition = {"op": "not", "condition": condition}
    return condition


def nested_stacks(depth: int) -> dict[str, Any]:
    node: dict[str, Any] = {"kind": "attributes"}
    for _ in range(depth - 1):
        node = {"kind": "stack", "children": [node]}
    return node


def many_bindings(document: dict[str, Any], total: int) -> None:
    for index in range(total - len(document["bindings"])):
        document["bindings"][f"extra_{index}"] = {"attribute": "temperature"}


def many_controls(document: dict[str, Any], total: int) -> None:
    for index in range(total - len(document["controls"])):
        document["controls"][f"extra_{index}"] = {
            "kind": "number",
            "binding": "target",
            "label": {"default": f"Extra {index}"},
        }


def resolve(document: dict[str, Any], attributes: dict) -> Any:
    return validate_presentation(
        PresentationEnvelope.model_validate(document), attributes
    )


def located(status: UnavailablePresentation) -> list[tuple[DiagnosticCode, str | None]]:
    return [(diagnostic.code, diagnostic.path) for diagnostic in status.diagnostics]


class TestThermostatDocument:
    @pytest.mark.parametrize(
        ("pointer", "value", "capability"),
        [
            ("/page/items/1/sticky", True, "layout-options/1"),
            ("/page/items/1/content/appearance", "plain", "layout-options/1"),
            ("/page/items/1/content/collapsible", True, "layout-options/1"),
            ("/page/items/1/content/collapsed", False, "layout-options/1"),
            ("/page/items/1/content/show_count", True, "layout-options/1"),
            (f"{MEASUREMENTS_PATH}/layout", "rows", "measurement-layout/1"),
            (f"{MEASUREMENTS_PATH}/layout", "inline", "measurement-layout/1"),
            ("/controls/target/kind", "slider", "slider/1"),
        ],
    )
    def test_extensions_require_declared_capability(
        self, thermostat_document, thermostat_attributes, pointer, value, capability
    ):
        put(thermostat_document, pointer, value)
        status = resolve(thermostat_document, thermostat_attributes)
        assert located(status) == [(DiagnosticCode.INVALID_DOCUMENT, "/requires")]
        thermostat_document["requires"].append(capability)
        assert isinstance(
            resolve(thermostat_document, thermostat_attributes), AvailablePresentation
        )

    def test_slider_rejects_non_numeric_binding(
        self, thermostat_document, thermostat_attributes
    ):
        thermostat_document["requires"].append("slider/1")
        put(thermostat_document, "/controls/target/kind", "slider")
        put(thermostat_document, "/controls/target/binding", "power")
        status = resolve(thermostat_document, thermostat_attributes)
        assert (DiagnosticCode.TYPE_MISMATCH, "/controls/target/kind") in located(
            status
        )

    def test_is_available(self, thermostat_envelope, thermostat_attributes):
        status = validate_presentation(thermostat_envelope, thermostat_attributes)
        assert isinstance(status, AvailablePresentation)
        assert status.status == "available"
        assert status.document.schema_version == 1
        assert status.model_dump(mode="json")["document"]["page"]["kind"] == "columns"

    def test_semantics_report_nothing(self, thermostat_document, thermostat_attributes):
        document = PresentationV1.model_validate(thermostat_document)
        assert check_semantics(document, thermostat_attributes) == []

    def test_uppercase_colour_is_normalised(
        self, thermostat_document, thermostat_attributes
    ):
        put(thermostat_document, f"{layer(SCREEN_RECT)}/fill", "#3A3A3A")
        status = resolve(thermostat_document, thermostat_attributes)
        assert isinstance(status, AvailablePresentation)
        face = status.document.page.items[1].content.children[0]
        assert face.layers[SCREEN_RECT].fill == "#3a3a3a"

    @pytest.mark.parametrize(
        "mutation",
        [
            lambda d: put(d, f"{layer(SCREEN_RECT)}/visible_when", nested_not(8)),
            lambda d: put(
                d,
                f"{layer(SCREEN_RECT)}/visible_when",
                {
                    "op": "all",
                    "conditions": [{"op": "is_known", "binding": "power"}] * 999,
                },
            ),
            lambda d: many_bindings(d, DOCUMENT_BUDGETS.max_bindings),
            lambda d: many_controls(d, DOCUMENT_BUDGETS.max_controls),
            lambda d: put(d, "/page", nested_stacks(DOCUMENT_BUDGETS.max_layout_depth)),
        ],
        ids=[
            "condition_depth_8",
            "condition_1000_ops",
            "300_bindings",
            "300_controls",
            "layout_depth_8",
        ],
    )
    def test_budgets_are_inclusive(
        self, thermostat_document, thermostat_attributes, mutation
    ):
        mutation(thermostat_document)
        status = resolve(thermostat_document, thermostat_attributes)
        assert isinstance(status, AvailablePresentation), located(status)


SEMANTIC_CASES: list[tuple[str, Mutation, list[tuple[DiagnosticCode, str]]]] = [
    (
        "unknown_binding_in_condition",
        lambda d: put(d, f"{layer(SCREEN_RECT)}/visible_when/binding", "nope"),
        [
            (
                DiagnosticCode.MISSING_BINDING,
                f"{layer(SCREEN_RECT)}/visible_when/binding",
            )
        ],
    ),
    (
        "unknown_binding_in_blocked_when",
        lambda d: put(d, f"{layer(BUTTON_OFF)}/blocked_when/binding", "nope"),
        [(DiagnosticCode.MISSING_BINDING, f"{layer(BUTTON_OFF)}/blocked_when/binding")],
    ),
    (
        "unknown_binding_in_colour_rule",
        lambda d: put(d, f"{layer(TENS_DIGIT)}/color/rules/0/when/binding", "nope"),
        [
            (
                DiagnosticCode.MISSING_BINDING,
                f"{layer(TENS_DIGIT)}/color/rules/0/when/binding",
            )
        ],
    ),
    (
        "cycle_on_number_control",
        lambda d: put(d, f"{layer(BUTTON_PLUS)}/action/op", "cycle"),
        [(DiagnosticCode.INVALID_ACTION, f"{layer(BUTTON_PLUS)}/action/op")],
    ),
    (
        "increment_on_select_control",
        lambda d: put(d, f"{layer(BUTTON_MODE)}/action/op", "increment"),
        [(DiagnosticCode.INVALID_ACTION, f"{layer(BUTTON_MODE)}/action/op")],
    ),
    (
        "toggle_on_number_control",
        lambda d: put(d, f"{layer(BUTTON_PLUS)}/action/op", "toggle"),
        [(DiagnosticCode.INVALID_ACTION, f"{layer(BUTTON_PLUS)}/action/op")],
    ),
    (
        "button_on_unknown_control",
        lambda d: put(d, f"{layer(BUTTON_OFF)}/action/control", "nope"),
        [(DiagnosticCode.MISSING_CONTROL, f"{layer(BUTTON_OFF)}/action/control")],
    ),
    (
        "ref_to_a_later_layer",
        lambda d: put(d, f"{layer(LOCK_POWER)}/anchor/ref", "icon_off"),
        [(DiagnosticCode.MISSING_LAYER_REF, f"{layer(LOCK_POWER)}/anchor/ref")],
    ),
    (
        "ref_to_an_unknown_layer",
        lambda d: put(d, f"{layer(LOCK_POWER)}/anchor/ref", "ghost"),
        [(DiagnosticCode.MISSING_LAYER_REF, f"{layer(LOCK_POWER)}/anchor/ref")],
    ),
    (
        "duplicate_layer_id",
        lambda d: put(d, f"{layer(0)}/id", "icon_power"),
        [(DiagnosticCode.INVALID_DOCUMENT, f"{layer(ICON_POWER)}/id")],
    ),
    (
        "condition_depth_9",
        lambda d: put(d, f"{layer(SCREEN_RECT)}/visible_when", nested_not(9)),
        [
            (
                DiagnosticCode.BUDGET_EXCEEDED,
                f"{layer(SCREEN_RECT)}/visible_when" + "/condition" * 8,
            )
        ],
    ),
    (
        "condition_1001_ops",
        lambda d: put(
            d,
            f"{layer(SCREEN_RECT)}/visible_when",
            {
                "op": "all",
                "conditions": [{"op": "is_known", "binding": "power"}] * 1000,
            },
        ),
        [(DiagnosticCode.BUDGET_EXCEEDED, f"{layer(SCREEN_RECT)}/visible_when")],
    ),
    (
        "binding_on_unknown_attribute",
        lambda d: put(d, "/bindings/power/attribute", "nope"),
        [(DiagnosticCode.MISSING_ATTRIBUTE, "/bindings/power/attribute")],
    ),
    (
        "toggle_control_on_float",
        lambda d: put(d, "/controls/target/kind", "toggle"),
        [
            (DiagnosticCode.TYPE_MISMATCH, "/controls/target/kind"),
            # The +/- buttons increment a control that no longer takes it.
            (DiagnosticCode.INVALID_ACTION, f"{layer(BUTTON_PLUS)}/action/op"),
            (DiagnosticCode.INVALID_ACTION, f"{layer(BUTTON_MINUS)}/action/op"),
        ],
    ),
    (
        "number_control_on_bool",
        lambda d: put(d, "/controls/power/kind", "number"),
        [
            (DiagnosticCode.TYPE_MISMATCH, "/controls/power/kind"),
            (DiagnosticCode.INVALID_ACTION, f"{layer(BUTTON_OFF)}/action/op"),
            (DiagnosticCode.INVALID_ACTION, f"{layer(BUTTON_ON)}/action/op"),
        ],
    ),
    (
        "select_control_without_value_options",
        lambda d: put(d, "/controls/fan/binding", "measured"),
        [(DiagnosticCode.TYPE_MISMATCH, "/controls/fan/kind")],
    ),
    (
        "control_on_unknown_binding",
        lambda d: put(d, "/controls/fan/binding", "nope"),
        [(DiagnosticCode.MISSING_BINDING, "/controls/fan/binding")],
    ),
    (
        "control_panel_unknown_control",
        lambda d: put(d, f"{CONTROL_PANEL_PATH}/controls/1", "nope"),
        [(DiagnosticCode.MISSING_CONTROL, f"{CONTROL_PANEL_PATH}/controls/1")],
    ),
    (
        "image_unknown_asset",
        lambda d: put(d, f"{layer(0)}/asset", "nope"),
        [(DiagnosticCode.MISSING_ASSET, f"{layer(0)}/asset")],
    ),
    (
        "glyph_set_unknown_asset",
        lambda d: put(d, "/glyph_sets/main/asset", "nope"),
        [(DiagnosticCode.MISSING_ASSET, "/glyph_sets/main/asset")],
    ),
    (
        "glyph_text_unknown_glyph_set",
        lambda d: put(d, f"{layer(TENS_DIGIT)}/glyph_set", "nope"),
        [(DiagnosticCode.MISSING_GLYPH_SET, f"{layer(TENS_DIGIT)}/glyph_set")],
    ),
    (
        "measurement_unknown_binding",
        lambda d: put(d, f"{MEASUREMENTS_PATH}/items/0/binding", "nope"),
        [(DiagnosticCode.MISSING_BINDING, f"{MEASUREMENTS_PATH}/items/0/binding")],
    ),
    (
        "deviation_on_string_binding",
        lambda d: put(d, f"{SETPOINT_TABLE_PATH}/rows/0/deviation/minuend", "unit"),
        [
            (
                DiagnosticCode.TYPE_MISMATCH,
                f"{SETPOINT_TABLE_PATH}/rows/0/deviation/minuend",
            )
        ],
    ),
    (
        "deviation_unknown_binding",
        lambda d: put(d, f"{SETPOINT_TABLE_PATH}/rows/0/deviation/subtrahend", "nope"),
        [
            (
                DiagnosticCode.MISSING_BINDING,
                f"{SETPOINT_TABLE_PATH}/rows/0/deviation/subtrahend",
            )
        ],
    ),
    (
        "demanded_unknown_control",
        lambda d: put(d, f"{SETPOINT_TABLE_PATH}/rows/0/demanded", {"control": "nope"}),
        [
            (
                DiagnosticCode.MISSING_CONTROL,
                f"{SETPOINT_TABLE_PATH}/rows/0/demanded/control",
            )
        ],
    ),
    (
        "demanded_unknown_binding",
        lambda d: put(d, f"{SETPOINT_TABLE_PATH}/rows/0/demanded", {"binding": "nope"}),
        [
            (
                DiagnosticCode.MISSING_BINDING,
                f"{SETPOINT_TABLE_PATH}/rows/0/demanded/binding",
            )
        ],
    ),
    (
        "regulated_unknown_binding",
        lambda d: put(d, f"{SETPOINT_TABLE_PATH}/rows/0/regulated/binding", "nope"),
        [
            (
                DiagnosticCode.MISSING_BINDING,
                f"{SETPOINT_TABLE_PATH}/rows/0/regulated/binding",
            )
        ],
    ),
    (
        "eq_string_against_bool",
        lambda d: put(d, f"{layer(SCREEN_RECT)}/visible_when/value", "on"),
        [(DiagnosticCode.TYPE_MISMATCH, f"{layer(SCREEN_RECT)}/visible_when/value")],
    ),
    (
        "eq_number_against_bool",
        lambda d: put(d, f"{layer(SCREEN_RECT)}/visible_when/value", 1),
        [(DiagnosticCode.TYPE_MISMATCH, f"{layer(SCREEN_RECT)}/visible_when/value")],
    ),
    (
        "in_string_against_float",
        lambda d: put(
            d, f"{layer(TENTHS_DIGIT)}/visible_when/conditions/1/values/0", "0.1"
        ),
        [
            (
                DiagnosticCode.TYPE_MISMATCH,
                f"{layer(TENTHS_DIGIT)}/visible_when/conditions/1/values/0",
            )
        ],
    ),
    (
        "digit_on_string_binding",
        lambda d: put(d, f"{layer(TENS_DIGIT)}/text/0/digit/binding", "unit"),
        [(DiagnosticCode.TYPE_MISMATCH, f"{layer(TENS_DIGIT)}/text/0/digit/binding")],
    ),
    (
        "number_on_bool_binding",
        lambda d: put(
            d, f"{layer(TOP_LEFT_TEMPERATURE_TEXT)}/text/0/number/binding", "power"
        ),
        [
            (
                DiagnosticCode.TYPE_MISMATCH,
                f"{layer(TOP_LEFT_TEMPERATURE_TEXT)}/text/0/number/binding",
            )
        ],
    ),
    (
        "select_part_unknown_binding",
        lambda d: put(
            d, f"{layer(TOP_LEFT_TEMPERATURE_TEXT)}/text/1/select/binding", "nope"
        ),
        [
            (
                DiagnosticCode.MISSING_BINDING,
                f"{layer(TOP_LEFT_TEMPERATURE_TEXT)}/text/1/select/binding",
            )
        ],
    ),
    (
        "capability_used_but_not_required",
        lambda d: d["requires"].remove("conditions/1"),
        [(DiagnosticCode.INVALID_DOCUMENT, "/requires")],
    ),
    (
        "301_bindings",
        lambda d: many_bindings(d, DOCUMENT_BUDGETS.max_bindings + 1),
        [(DiagnosticCode.BUDGET_EXCEEDED, "/bindings")],
    ),
    (
        "301_controls",
        lambda d: many_controls(d, DOCUMENT_BUDGETS.max_controls + 1),
        [(DiagnosticCode.BUDGET_EXCEEDED, "/controls")],
    ),
    (
        "601_nodes",
        lambda d: put(
            d,
            "/page",
            {
                "kind": "stack",
                "children": [{"kind": "attributes"}] * DOCUMENT_BUDGETS.max_nodes,
            },
        ),
        [(DiagnosticCode.BUDGET_EXCEEDED, "/page")],
    ),
    (
        "layout_depth_9",
        lambda d: put(d, "/page", nested_stacks(DOCUMENT_BUDGETS.max_layout_depth + 1)),
        [(DiagnosticCode.BUDGET_EXCEEDED, "/page" + "/children/0" * 8)],
    ),
]


INDEPENDENT_CASES = [
    "unknown_binding_in_condition",
    "cycle_on_number_control",
    "ref_to_a_later_layer",
    "binding_on_unknown_attribute",
    "image_unknown_asset",
    "measurement_unknown_binding",
    "control_panel_unknown_control",
    "in_string_against_float",
]
"""Cases whose mutations touch different fields, so they compose."""


class TestSemanticRules:
    @pytest.mark.parametrize(
        ("mutation", "expected"),
        [case[1:] for case in SEMANTIC_CASES],
        ids=[case[0] for case in SEMANTIC_CASES],
    )
    def test_one_rule(
        self, thermostat_document, thermostat_attributes, mutation, expected
    ):
        mutation(thermostat_document)
        status = resolve(thermostat_document, thermostat_attributes)
        assert isinstance(status, UnavailablePresentation)
        assert located(status) == expected
        assert status.status == "unavailable"
        assert all(diagnostic.message for diagnostic in status.diagnostics)

    def test_every_rule_is_collected(self, thermostat_document, thermostat_attributes):
        cases = [case for case in SEMANTIC_CASES if case[0] in INDEPENDENT_CASES]
        assert len(cases) == len(INDEPENDENT_CASES)
        for _, mutation, _ in cases:
            mutation(thermostat_document)
        status = resolve(thermostat_document, thermostat_attributes)
        assert isinstance(status, UnavailablePresentation)
        expected = {pair for _, _, pairs in cases for pair in pairs}
        assert set(located(status)) == expected
        assert len(status.diagnostics) == len(expected)

    def test_no_attributes_at_all(self, thermostat_document):
        status = resolve(thermostat_document, {})
        assert isinstance(status, UnavailablePresentation)
        assert {code for code, _ in located(status)} == {
            DiagnosticCode.MISSING_ATTRIBUTE
        }
        assert len(status.diagnostics) == len(thermostat_document["bindings"])

    def test_missing_attribute_is_reported_once(
        self, thermostat_document, thermostat_attributes
    ):
        """The bindings that name it keep working structurally; only the
        declaration is flagged, not each of its many uses on the face."""
        del thermostat_attributes["onoff_state"]
        status = resolve(thermostat_document, thermostat_attributes)
        assert isinstance(status, UnavailablePresentation)
        assert located(status) == [
            (DiagnosticCode.MISSING_ATTRIBUTE, "/bindings/power/attribute")
        ]


class TestCompatibility:
    def test_future_version_reports_nothing_else(
        self, thermostat_document, thermostat_attributes
    ):
        thermostat_document["schema_version"] = 2
        put(thermostat_document, "/bindings/power/attribute", "nope")
        status = resolve(thermostat_document, thermostat_attributes)
        assert isinstance(status, UnavailablePresentation)
        assert located(status) == [
            (DiagnosticCode.UNSUPPORTED_VERSION, "/schema_version")
        ]

    def test_unknown_capabilities_are_each_reported(
        self, thermostat_document, thermostat_attributes
    ):
        thermostat_document["requires"] += ["magic/1", "layout/2"]
        status = resolve(thermostat_document, thermostat_attributes)
        assert isinstance(status, UnavailablePresentation)
        assert located(status) == [
            (DiagnosticCode.UNSUPPORTED_CAPABILITY, "/requires/7"),
            (DiagnosticCode.UNSUPPORTED_CAPABILITY, "/requires/8"),
        ]
        assert "magic/1" in status.diagnostics[0].message


STRUCTURAL_CASES: list[tuple[str, Mutation, str, str]] = [
    (
        "bad_colour",
        lambda d: put(d, f"{layer(SCREEN_RECT)}/fill", "red"),
        f"{layer(SCREEN_RECT)}/fill",
        "should match pattern",
    ),
    (
        "anchor_without_box_or_ref",
        lambda d: put(d, f"{layer(TENS_DIGIT)}/anchor", {"align": "center"}),
        f"{layer(TENS_DIGIT)}/anchor",
        "either a box or a ref",
    ),
    (
        "bad_align",
        lambda d: put(d, f"{layer(TENS_DIGIT)}/anchor/align", "middle"),
        f"{layer(TENS_DIGIT)}/anchor/align",
        "Input should be",
    ),
    (
        "unknown_layer_kind",
        lambda d: put(d, f"{layer(SCREEN_RECT)}/kind", "video"),
        layer(SCREEN_RECT),
        "does not match any of the expected tags",
    ),
    (
        "unknown_text_part",
        lambda d: put(d, f"{layer(TENS_DIGIT)}/text/0", {"glyph": "x"}),
        f"{layer(TENS_DIGIT)}/text/0",
        "a text part is one of",
    ),
    (
        "root_extra_field",
        lambda d: put(d, "/extra", 1),
        "/extra",
        "Extra inputs are not permitted",
    ),
    (
        "zero_view_box",
        lambda d: put(d, f"{FACE_PATH}/view_box/width", 0),
        f"{FACE_PATH}/view_box/width",
        "greater than 0",
    ),
    (
        "binding_named_like_a_union_field_keeps_its_path",
        lambda d: put(d, "/bindings/value", {"attribute": 5}),
        "/bindings/value/attribute",
        "Input should be a valid string",
    ),
    (
        "condition_deep_in_a_colour_rule",
        lambda d: put(d, f"{layer(TENS_DIGIT)}/color/rules/1/when/binding", "Bad"),
        f"{layer(TENS_DIGIT)}/color/rules/1/when/binding",
        "should match pattern",
    ),
    (
        "nested_page_node",
        lambda d: put(d, f"{CONTROL_PANEL_PATH}/controls", "power"),
        f"{CONTROL_PANEL_PATH}/controls",
        "Input should be a valid list",
    ),
]


class TestStructuralErrors:
    @pytest.mark.parametrize(
        ("mutation", "path", "message"),
        [case[1:] for case in STRUCTURAL_CASES],
        ids=[case[0] for case in STRUCTURAL_CASES],
    )
    def test_located_as_a_json_pointer(
        self, thermostat_document, thermostat_attributes, mutation, path, message
    ):
        mutation(thermostat_document)
        status = resolve(thermostat_document, thermostat_attributes)
        assert isinstance(status, UnavailablePresentation)
        assert {diagnostic.code for diagnostic in status.diagnostics} == {
            DiagnosticCode.INVALID_DOCUMENT
        }
        assert [diagnostic.path for diagnostic in status.diagnostics] == [path]
        assert message in status.diagnostics[0].message

    def test_scalar_union_errors_are_deduplicated_by_path_and_message(
        self, thermostat_document, thermostat_attributes
    ):
        put(thermostat_document, f"{layer(SCREEN_RECT)}/visible_when/value", [1])
        status = resolve(thermostat_document, thermostat_attributes)
        assert isinstance(status, UnavailablePresentation)
        paths = {diagnostic.path for diagnostic in status.diagnostics}
        assert paths == {f"{layer(SCREEN_RECT)}/visible_when/value"}
        messages = [diagnostic.message for diagnostic in status.diagnostics]
        assert len(messages) == len(set(messages))

    def test_structural_errors_stop_before_semantics(
        self, thermostat_document, thermostat_attributes
    ):
        put(thermostat_document, f"{layer(SCREEN_RECT)}/fill", "red")
        put(thermostat_document, "/bindings/power/attribute", "nope")
        status = resolve(thermostat_document, thermostat_attributes)
        assert isinstance(status, UnavailablePresentation)
        assert [d.code for d in status.diagnostics] == [DiagnosticCode.INVALID_DOCUMENT]
