"""Unit tests for apps.config_validation."""

import pytest
from jsonschema.exceptions import ValidationError as JsonSchemaValidationError

from apps.config_validation import _to_error_item, validate_config, validate_schema
from apps.errors import (
    ConfigValidationError,
    InvalidAppSchemaError,
    ValidationErrorItem,
)
from models.errors import InvalidError

SCHEMA = {
    "type": "object",
    "properties": {
        "lat": {"type": "number", "minimum": -90, "maximum": 90},
        "lng": {"type": "number", "minimum": -180, "maximum": 180},
        "label": {"type": "string", "format": "asset-id"},
        "mode": {"type": "string", "enum": ["comfort", "eco"]},
        "meters": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {"point_id": {"type": "string"}},
                "required": ["point_id"],
            },
        },
    },
    "required": ["lat", "lng"],
    "i18n": {"lat": {"fr": "Latitude"}},
}


def _validation_errors(payload) -> ConfigValidationError:
    with pytest.raises(ConfigValidationError) as exc_info:
        validate_config(payload, SCHEMA)
    return exc_info.value


def test_valid_payload_passes():
    validate_config({"lat": 48.8, "lng": 2.3}, SCHEMA)


@pytest.mark.parametrize(
    ("payload", "loc", "type_", "msg_fragment"),
    [
        pytest.param(
            {"lat": 48.8},
            ("lng",),
            "missing",
            "'lng' is a required property",
            id="required-appends-the-missing-property-to-loc",
        ),
        pytest.param(
            {"lat": "north", "lng": 2.3},
            ("lat",),
            "type",
            "is not of type 'number'",
            id="type",
        ),
        pytest.param(
            {"lat": 48.8, "lng": 2.3, "mode": "party"},
            ("mode",),
            "enum",
            "is not one of",
            id="enum",
        ),
        pytest.param(
            {"lat": 999, "lng": 2.3},
            ("lat",),
            "maximum",
            "greater than the maximum",
            id="constraint-keyword",
        ),
        pytest.param(
            {"lat": 48.8, "lng": 2.3, "meters": [{"point_id": 42}]},
            ("meters", 0, "point_id"),
            "type",
            "is not of type 'string'",
            id="nested-indexed-path",
        ),
        pytest.param(
            {"lat": 48.8, "lng": 2.3, "meters": [{"point_id": "a"}, {}]},
            ("meters", 1, "point_id"),
            "missing",
            "'point_id' is a required property",
            id="nested-required-lands-on-the-item-field",
        ),
    ],
)
def test_error_items_follow_the_pydantic_contract(payload, loc, type_, msg_fragment):
    exc = _validation_errors(payload)
    assert len(exc.errors) == 1
    item = exc.errors[0]
    assert item.loc == loc
    assert item.type == type_
    assert msg_fragment in item.msg


def test_multiple_errors_are_collected_and_sorted_by_path():
    exc = _validation_errors({"lat": 999, "lng": -999, "meters": [{}]})
    assert [e.loc for e in exc.errors] == [
        ("lat",),
        ("lng",),
        ("meters", 0, "point_id"),
    ]


def test_str_keeps_the_flattened_summary():
    """String-only consumers (logs, CLI) still get the aggregated one-liner."""
    exc = _validation_errors({"lat": 999, "lng": -999})
    detail = str(exc)
    assert detail.startswith("Config validation failed: ")
    assert "lat" in detail
    assert "lng" in detail


def test_root_errors_are_labeled_in_the_summary():
    # `required` now lands on the field, so a root loc only occurs for other
    # validators (e.g. a root `type` error) — pin the summary label directly.
    exc = ConfigValidationError(
        [ValidationErrorItem(loc=(), msg="is not of type 'object'", type="type")]
    )
    assert "<root>: is not of type 'object'" in str(exc)


def test_config_validation_error_is_an_invalid_error():
    """Consumers catching the generic InvalidError keep working."""
    with pytest.raises(InvalidError, match="lng"):
        validate_config({"lat": 48.8}, SCHEMA)


def test_unmatchable_required_message_falls_back_to_the_parent_loc():
    """If jsonschema's `required` wording ever changes, the item degrades to
    the old parent-loc shape instead of pointing at the wrong field."""
    error = JsonSchemaValidationError(
        "custom wording",
        validator="required",
        validator_value=["api_key"],
        instance={},
    )
    item = _to_error_item(error)
    assert item.loc == ()
    assert item.type == "required"


def test_unknown_format_annotation_is_ignored():
    """`format: asset-id` is a UI annotation with no validator to enforce it."""
    validate_config({"lat": 48.8, "lng": 2.3, "label": "not-a-real-asset-id"}, SCHEMA)


def test_unknown_root_keyword_is_ignored():
    """The `i18n` root key is a Draft 2020-12 unknown keyword, silently ignored."""
    validate_config({"lat": 48.8, "lng": 2.3}, SCHEMA)


class TestValidateSchema:
    def test_valid_schema_passes(self):
        validate_schema(SCHEMA)

    @pytest.mark.parametrize(
        "schema",
        [
            pytest.param({"type": "not-a-json-type"}, id="unknown-type"),
            pytest.param({"required": "lat"}, id="required-not-an-array"),
            pytest.param(
                {"properties": {"lat": {"minimum": "zero"}}}, id="minimum-not-a-number"
            ),
            pytest.param([{"type": "object"}], id="schema-is-a-list"),
        ],
    )
    def test_malformed_schema_raises(self, schema):
        with pytest.raises(InvalidAppSchemaError, match="invalid config schema"):
            validate_schema(schema)

    @pytest.mark.parametrize(
        "schema",
        [
            pytest.param(
                {"properties": {"x": {"$ref": "#/$defs/Missing"}}},
                id="dangling-local-ref",
            ),
            pytest.param(
                {"properties": {"x": {"$ref": "https://example.com/x.json"}}},
                id="remote-ref",
            ),
            pytest.param(
                {
                    "properties": {
                        "rows": {"type": "array", "items": {"$ref": "#/$defs/Nope"}}
                    }
                },
                id="dangling-ref-inside-items",
            ),
        ],
    )
    def test_unresolvable_ref_raises(self, schema):
        """`check_schema` passes these — refs are only resolved at validation
        time, where they would explode as an unhandled 500 (AGR-993 AC2)."""
        with pytest.raises(InvalidAppSchemaError, match="invalid config schema"):
            validate_schema(schema)

    def test_resolvable_local_ref_passes(self):
        validate_schema(
            {
                "$defs": {"Point": {"type": "string"}},
                "properties": {"x": {"$ref": "#/$defs/Point"}},
            }
        )

    def test_ref_shaped_data_inside_value_keywords_is_not_walked(self):
        """`const`/`enum`/`default`/`examples` hold data, not subschemas — a
        `$ref`-looking dict inside them must not be resolved as a reference."""
        validate_schema(
            {
                "properties": {
                    "template": {"type": "object", "const": {"$ref": "#/nowhere"}}
                }
            }
        )


def test_validate_config_maps_unresolvable_refs_to_the_app_fault():
    """Backstop for callers that skipped `validate_schema`: the ref failure
    inside `iter_errors` stays a controlled app-fault error, never a 500."""
    schema = {"properties": {"x": {"$ref": "#/$defs/Missing"}}}
    with pytest.raises(InvalidAppSchemaError, match="invalid config schema"):
        validate_config({"x": 1}, schema)
