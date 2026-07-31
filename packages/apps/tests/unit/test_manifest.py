"""Unit tests for manifest parsing: `produces` / `reads` / `commands`."""

import pytest

from apps.manifest import AppCapabilities, parse_capabilities

FULL_MANIFEST = """
name: Copilot
api_url: http://copilot:8000
description: Setpoint regulation per zone
icon: brain
produces: [decision_log]
reads:
  hotel_room: [occupied, guest_count]
  thermostat: [temperature, temperature_setpoint]
commands:
  thermostat: [temperature_setpoint]
"""


class TestParseCapabilities:
    def test_full_manifest(self):
        capabilities = parse_capabilities(FULL_MANIFEST)

        assert capabilities.produces == ["decision_log"]
        assert capabilities.reads == {
            "hotel_room": ["occupied", "guest_count"],
            "thermostat": ["temperature", "temperature_setpoint"],
        }
        assert capabilities.commands == {"thermostat": ["temperature_setpoint"]}

    def test_identity_fields_are_dropped(self):
        """Name, api_url and friends live on `App` as columns of their own."""
        capabilities = parse_capabilities(FULL_MANIFEST)

        assert not hasattr(capabilities, "name")
        assert set(capabilities.model_dump()) == {"produces", "reads", "commands"}

    def test_partial_manifest_keeps_declared_fields(self):
        capabilities = parse_capabilities("produces: [weather_sensor]\n")

        assert capabilities.produces == ["weather_sensor"]
        assert capabilities.reads == {}
        assert capabilities.commands == {}

    @pytest.mark.parametrize(
        "manifest",
        [
            pytest.param("", id="empty"),
            pytest.param(
                "name: My App\napi_url: http://app:8000\n", id="no-capability-fields"
            ),
            pytest.param("name: [unclosed\n", id="malformed-yaml"),
            pytest.param("- one\n- two\n", id="not-a-mapping"),
            pytest.param("just a string\n", id="scalar"),
            pytest.param("produces:\nreads:\ncommands:\n", id="null-values"),
            pytest.param("produces: thermostat\n", id="wrong-produces-type"),
            pytest.param("reads: [thermostat]\n", id="wrong-reads-type"),
            pytest.param(
                "reads:\n  thermostat: temperature\n", id="reads-values-not-lists"
            ),
        ],
    )
    def test_yields_empty_capabilities(self, manifest):
        """Serialization of stored rows must never raise on a bad manifest."""
        assert parse_capabilities(manifest) == AppCapabilities()
