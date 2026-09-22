"""Value types an attribute driver may declare: localized texts, unit symbols,
groups and declarative write constraints."""

import pytest
from pydantic import TypeAdapter, ValidationError

from models.attribute_metadata import (
    AttributeGroup,
    AttributeRef,
    LocalizedText,
    Unit,
    WriteConstraints,
)

_unit = TypeAdapter(Unit)
_group = TypeAdapter(AttributeGroup)


class TestLocalizedText:
    @pytest.mark.parametrize(
        ("payload", "expected_default", "expected_translations"),
        [
            ({"default": "Setpoint"}, "Setpoint", {}),
            ({"default": "  Setpoint  "}, "Setpoint", {}),
            # a bare string is the shortcut for {default: <string>}
            ("Setpoint", "Setpoint", {}),
            ("  Setpoint  ", "Setpoint", {}),
            (
                {"default": "Setpoint", "translations": {"fr": "Consigne"}},
                "Setpoint",
                {"fr": "Consigne"},
            ),
            (
                {"default": "Setpoint", "translations": {"fr-CA": "Consigne "}},
                "Setpoint",
                {"fr-CA": "Consigne"},
            ),
            (
                {"default": "Setpoint", "translations": {"zh-Hant": "設定點"}},
                "Setpoint",
                {"zh-Hant": "設定點"},
            ),
        ],
    )
    def test_accepts(self, payload, expected_default, expected_translations):
        text = LocalizedText.model_validate(payload)
        assert text.default == expected_default
        assert text.translations == expected_translations

    @pytest.mark.parametrize(
        ("payload", "error_type"),
        [
            ({}, "missing"),
            ({"default": ""}, "string_too_short"),
            ({"default": "   "}, "string_too_short"),
            ({"default": "x" * 201}, "string_too_long"),
            # the string shortcut obeys the same rules as default
            ("", "string_too_short"),
            ("   ", "string_too_short"),
            ("x" * 201, "string_too_long"),
            ({"default": "Setpoint", "translations": {"fr": ""}}, "string_too_short"),
            (
                {"default": "Setpoint", "translations": {"FR": "x"}},
                "string_pattern_mismatch",
            ),
            (
                {"default": "Setpoint", "translations": {"french": "x"}},
                "string_pattern_mismatch",
            ),
            (
                {"default": "Setpoint", "translations": {"fr_CA": "x"}},
                "string_pattern_mismatch",
            ),
            ({"default": "Setpoint", "extra": 1}, "extra_forbidden"),
        ],
    )
    def test_rejects(self, payload, error_type):
        with pytest.raises(ValidationError) as excinfo:
            LocalizedText.model_validate(payload)
        assert error_type in {e["type"] for e in excinfo.value.errors()}

    # a number or a list is neither a string nor an object
    @pytest.mark.parametrize("payload", [123, True, ["a"], 1.5])
    def test_rejects_non_text_payloads(self, payload):
        with pytest.raises(
            ValidationError, match="must be a string or an object with a default"
        ):
            LocalizedText.model_validate(payload)

    @pytest.mark.parametrize(
        ("language", "expected"),
        [
            (None, "Setpoint"),
            ("fr", "Consigne"),
            ("fr-CA", "Consigne (CA)"),
            ("fr-BE", "Consigne"),  # unknown region falls back to the base language
            ("FR-BE", "Consigne"),  # base language lookup is case-insensitive
            ("de", "Setpoint"),
            ("de-AT", "Setpoint"),
        ],
    )
    def test_resolve(self, language, expected):
        text = LocalizedText(
            default="Setpoint",
            translations={"fr": "Consigne", "fr-CA": "Consigne (CA)"},
        )
        assert text.resolve(language) == expected


class TestUnit:
    @pytest.mark.parametrize(
        ("raw", "expected"),
        [("°C", "°C"), (" kWh ", "kWh"), ("m³/h", "m³/h"), ("%", "%")],
    )
    def test_accepts_symbols(self, raw, expected):
        assert _unit.validate_python(raw) == expected

    @pytest.mark.parametrize("raw", ["", "   ", "x" * 17])
    def test_rejects_empty_or_too_long(self, raw):
        with pytest.raises(ValidationError):
            _unit.validate_python(raw)


class TestAttributeGroup:
    @pytest.mark.parametrize("raw", ["setpoints", "fan", "zone_1", "a" * 64])
    def test_accepts_snake_case_keys(self, raw):
        assert _group.validate_python(raw) == raw

    @pytest.mark.parametrize("raw", ["", "Setpoints", "1st", "set-points", "a" * 65])
    def test_rejects_non_snake_case_keys(self, raw):
        with pytest.raises(ValidationError):
            _group.validate_python(raw)


class TestWriteConstraints:
    @pytest.mark.parametrize("bound", ["minimum", "maximum", "step"])
    @pytest.mark.parametrize("value", [float("nan"), float("inf"), -float("inf")])
    def test_non_finite_constant_is_refused(self, bound, value):
        with pytest.raises(ValidationError, match="finite number"):
            WriteConstraints.model_validate({bound: value})

    @pytest.mark.parametrize(
        "payload",
        [
            {"step": 0.5},
            {"step": 1},
            {"minimum": 16},
            {"maximum": 30.5},
            {"minimum": 16, "maximum": 16},
            {"minimum": 16, "maximum": 30, "step": 0.5},
            {"minimum": {"attribute": "min"}, "maximum": {"attribute": "max"}},
            {"minimum": 16, "maximum": {"attribute": "max"}},
            # The step can be a device setting too (a configurable precision).
            {"step": {"attribute": "precision"}},
            {"step": {"attribute": "precision"}, "minimum": 16, "maximum": 30},
        ],
    )
    def test_accepts(self, payload):
        constraints = WriteConstraints.model_validate(payload)
        assert constraints.model_dump(exclude_none=True) == payload

    @pytest.mark.parametrize(
        ("payload", "message"),
        [
            ({}, "at least one of step, minimum or maximum"),
            ({"step": 0}, "greater than 0"),
            ({"step": -1}, "greater than 0"),
            ({"minimum": 30, "maximum": 16}, "must not exceed maximum"),
            ({"step": True}, "not a boolean"),
            ({"minimum": True}, "not a boolean"),
            ({"minimum": {"attribute": ""}}, "at least 1 character"),
            ({"minimum": {"attribute": "min", "extra": 1}}, "Extra inputs"),
            ({"step": 1, "extra": 1}, "Extra inputs"),
        ],
    )
    def test_rejects(self, payload, message):
        with pytest.raises(ValidationError, match=message):
            WriteConstraints.model_validate(payload)

    def test_json_numbers_keep_their_type(self):
        constraints = WriteConstraints.model_validate_json(
            '{"minimum": 16, "maximum": 30.5}'
        )
        assert constraints.minimum == 16
        assert isinstance(constraints.minimum, int)
        assert isinstance(constraints.maximum, float)

    def test_referenced_step_is_a_reference_like_the_bounds(self):
        constraints = WriteConstraints(
            step=AttributeRef(attribute="precision"), minimum=16
        )
        assert constraints.step == AttributeRef(attribute="precision")
