"""The envelope keeps any bounded JSON document verbatim and peeks two fields."""

import math
from datetime import UTC, datetime

import pytest
from pydantic import ValidationError

from devices_manager.core.presentation import DOCUMENT_BUDGETS, PresentationEnvelope

FUTURE_DOCUMENT = {
    "schema_version": 7,
    "requires": ["warp/3", "layout/1"],
    "widgets": [{"kind": "hologram", "depth": 3.5, "flags": [True, None, "x", 0]}],
    "empty": {},
}


def _nested_lists(levels: int) -> list:
    """``levels`` lists nested in one another, the innermost empty."""
    value: list = []
    for _ in range(levels - 1):
        value = [value]
    return value


class TestRoundTrip:
    def test_thermostat_document_is_kept_verbatim(self, thermostat_document):
        envelope = PresentationEnvelope.model_validate(thermostat_document)
        assert envelope.document == thermostat_document
        assert envelope.schema_version == 1
        assert envelope.requires == thermostat_document["requires"]
        assert envelope.is_version_supported

    def test_future_version_is_kept_verbatim(self):
        envelope = PresentationEnvelope.model_validate(FUTURE_DOCUMENT)
        assert envelope.document == FUTURE_DOCUMENT
        assert envelope.schema_version == 7
        assert not envelope.is_version_supported

    def test_values_are_not_coerced(self):
        """A float that spells an integer stays a float, and so on: what was
        written is what is stored."""
        document = {"schema_version": 1, "requires": [], "a": 1.0, "b": 1, "c": True}
        dumped = PresentationEnvelope.model_validate(document).document
        assert [type(dumped[key]) for key in "abc"] == [float, int, bool]

    def test_document_is_a_copy(self):
        envelope = PresentationEnvelope.model_validate(FUTURE_DOCUMENT)
        widgets = envelope.document["widgets"]
        assert isinstance(widgets, list)
        widgets.clear()
        assert envelope.document == FUTURE_DOCUMENT

    def test_json_mode_dump_round_trips(self, thermostat_document):
        envelope = PresentationEnvelope.model_validate(thermostat_document)
        again = PresentationEnvelope.model_validate(envelope.model_dump(mode="json"))
        assert again == envelope

    def test_instance_passes_through(self):
        envelope = PresentationEnvelope.model_validate(FUTURE_DOCUMENT)
        assert PresentationEnvelope.model_validate(envelope) is envelope


class TestPeekedFields:
    @pytest.mark.parametrize(
        "document",
        [
            {"requires": ["layout/1"]},
            {"schema_version": "1", "requires": []},
            {"schema_version": True, "requires": []},
            {"schema_version": 1.5, "requires": []},
            {"schema_version": 1},
            {"schema_version": 1, "requires": "layout/1"},
            {"schema_version": 1, "requires": [1]},
            ["schema_version", 1],
            None,
        ],
        ids=[
            "no_version",
            "string_version",
            "bool_version",
            "float_version",
            "no_requires",
            "requires_not_a_list",
            "requires_not_strings",
            "not_an_object",
            "null",
        ],
    )
    def test_rejected(self, document):
        with pytest.raises(ValidationError):
            PresentationEnvelope.model_validate(document)


class TestJsonBudget:
    @pytest.mark.parametrize(
        ("value", "reason"),
        [
            (math.nan, "non-finite number at /bad"),
            (math.inf, "non-finite number at /bad"),
            ({1: "x"}, "non-string key 1 at /bad"),
            ({"x", "y"}, "unsupported value of type set at /bad"),
            (datetime(2026, 1, 1, tzinfo=UTC), "unsupported value of type datetime"),
            (b"png", "unsupported value of type bytes at /bad"),
            ([{"deep": [math.nan]}], "non-finite number at /bad/0/deep/0"),
        ],
        ids=["nan", "inf", "int_key", "set", "datetime", "bytes", "nested_nan"],
    )
    def test_non_json_values_rejected(self, value, reason):
        with pytest.raises(ValidationError, match=reason):
            PresentationEnvelope.model_validate(
                {"schema_version": 1, "requires": [], "bad": value}
            )

    def test_depth_at_the_budget_accepted(self):
        # The root object is depth 1; each nested list adds one.
        deep = _nested_lists(DOCUMENT_BUDGETS.max_document_depth - 1)
        envelope = PresentationEnvelope.model_validate(
            {"schema_version": 1, "requires": [], "deep": deep}
        )
        assert envelope.document["deep"] == deep

    def test_depth_beyond_the_budget_rejected(self):
        deep = _nested_lists(DOCUMENT_BUDGETS.max_document_depth)
        with pytest.raises(ValidationError, match="nesting deeper than 64"):
            PresentationEnvelope.model_validate(
                {"schema_version": 1, "requires": [], "deep": deep}
            )

    def test_node_count_at_the_budget_accepted(self):
        # root + schema_version + requires + the list itself = 4 nodes.
        items = list(range(DOCUMENT_BUDGETS.max_document_nodes - 4))
        envelope = PresentationEnvelope.model_validate(
            {"schema_version": 1, "requires": [], "items": items}
        )
        assert envelope.document["items"] == items

    def test_node_count_beyond_the_budget_rejected(self):
        items = list(range(DOCUMENT_BUDGETS.max_document_nodes - 3))
        with pytest.raises(ValidationError, match="more than 50000 nodes"):
            PresentationEnvelope.model_validate(
                {"schema_version": 1, "requires": [], "items": items}
            )
