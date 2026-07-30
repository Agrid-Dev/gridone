"""Unit tests for apps.config_validation."""

import pytest

from apps.config_validation import validate_config
from models.errors import InvalidError

SCHEMA = {
    "type": "object",
    "properties": {
        "lat": {"type": "number", "minimum": -90, "maximum": 90},
        "lng": {"type": "number", "minimum": -180, "maximum": 180},
        "label": {"type": "string", "format": "asset-id"},
    },
    "required": ["lat", "lng"],
    "i18n": {"lat": {"fr": "Latitude"}},
}


def test_valid_payload_passes():
    validate_config({"lat": 48.8, "lng": 2.3}, SCHEMA)


def test_missing_required_field_raises():
    with pytest.raises(InvalidError, match="lng"):
        validate_config({"lat": 48.8}, SCHEMA)


def test_out_of_range_value_raises():
    with pytest.raises(InvalidError, match="lat"):
        validate_config({"lat": 999, "lng": 2.3}, SCHEMA)


def test_multiple_errors_are_aggregated():
    with pytest.raises(InvalidError) as exc_info:
        validate_config({"lat": 999, "lng": -999}, SCHEMA)
    detail = str(exc_info.value)
    assert "lat" in detail
    assert "lng" in detail


def test_unknown_format_annotation_is_ignored():
    """`format: asset-id` is a UI annotation with no validator to enforce it."""
    validate_config({"lat": 48.8, "lng": 2.3, "label": "not-a-real-asset-id"}, SCHEMA)


def test_unknown_root_keyword_is_ignored():
    """The `i18n` root key is a Draft 2020-12 unknown keyword, silently ignored."""
    validate_config({"lat": 48.8, "lng": 2.3}, SCHEMA)
