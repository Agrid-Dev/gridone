"""Structured references to attributes: read, and followed on rename."""

import pytest

from devices_manager.core.presentation import (
    PresentationEnvelope,
    referenced_attributes,
    rename_attribute,
)

FUTURE_DOCUMENT = {
    "schema_version": 3,
    "requires": ["layout/3"],
    "bindings": {"measured": {"attribute": "temperature"}},
}

MALFORMED_V1 = {
    "schema_version": 1,
    "requires": ["layout/1"],
    "bindings": {
        "measured": {"attribute": "temperature"},
        "broken": "temperature",
        "typed": {"attribute": 5},
    },
}


class TestReferencedAttributes:
    def test_thermostat(self, thermostat_envelope, thermostat_attributes):
        assert referenced_attributes(thermostat_envelope) == set(thermostat_attributes)

    def test_unsupported_version_references_nothing(self):
        assert (
            referenced_attributes(PresentationEnvelope.model_validate(FUTURE_DOCUMENT))
            == set()
        )

    @pytest.mark.parametrize(
        ("document", "expected"),
        [
            (MALFORMED_V1, {"temperature"}),
            ({"schema_version": 1, "requires": [], "bindings": ["x"]}, set()),
            ({"schema_version": 1, "requires": []}, set()),
        ],
        ids=["mixed_entries", "bindings_not_a_mapping", "no_bindings"],
    )
    def test_only_well_formed_entries_count(self, document, expected):
        assert (
            referenced_attributes(PresentationEnvelope.model_validate(document))
            == expected
        )


class TestRenameAttribute:
    def test_rewrites_every_binding_on_the_attribute(self, thermostat_document):
        thermostat_document["bindings"]["measured_again"] = {"attribute": "temperature"}
        envelope = PresentationEnvelope.model_validate(thermostat_document)
        renamed = rename_attribute(envelope, "temperature", "room_temperature")
        bindings = renamed.document["bindings"]
        assert isinstance(bindings, dict)
        assert bindings["measured"] == {"attribute": "room_temperature"}
        assert bindings["measured_again"] == {"attribute": "room_temperature"}
        assert "temperature" not in referenced_attributes(renamed)
        assert "room_temperature" in referenced_attributes(renamed)

    def test_touches_nothing_else(self, thermostat_document):
        """Binding ids, labels and text are not references: the setpoint row
        is still labelled "Temperature" once the attribute is "room_temperature"."""
        envelope = PresentationEnvelope.model_validate(thermostat_document)
        renamed = rename_attribute(envelope, "temperature", "room_temperature")
        expected = {**thermostat_document}
        expected["bindings"] = {
            **thermostat_document["bindings"],
            "measured": {"attribute": "room_temperature"},
        }
        assert renamed.document == expected

    def test_returns_a_new_envelope(self, thermostat_envelope):
        before = thermostat_envelope.document
        renamed = rename_attribute(
            thermostat_envelope, "temperature", "room_temperature"
        )
        assert renamed is not thermostat_envelope
        assert thermostat_envelope.document == before

    def test_unknown_attribute_changes_nothing(self, thermostat_envelope):
        renamed = rename_attribute(thermostat_envelope, "nope", "still_nope")
        assert renamed.document == thermostat_envelope.document

    def test_unsupported_version_is_returned_untouched(self):
        envelope = PresentationEnvelope.model_validate(FUTURE_DOCUMENT)
        assert rename_attribute(envelope, "temperature", "room_temperature") is envelope

    def test_malformed_v1_follows_where_it_can(self):
        envelope = PresentationEnvelope.model_validate(MALFORMED_V1)
        renamed = rename_attribute(envelope, "temperature", "room_temperature")
        assert renamed.document["bindings"] == {
            "measured": {"attribute": "room_temperature"},
            "broken": "temperature",
            "typed": {"attribute": 5},
        }
