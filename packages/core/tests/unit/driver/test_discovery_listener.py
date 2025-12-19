import pytest
from core.driver.discovery_listener import DiscoveryListener


@pytest.fixture
def listener_raw() -> dict:
    return {
        "topic": "/my/topic",
        "field_getters": [
            {"name": "vendor_id", "adapters": [{"json_pointer": "/id"}]},
            {"name": "gateway_id", "adapters": [{"json_pointer": "/gateway_id"}]},
        ],
    }


def test_create_from_dict(listener_raw):
    listener = DiscoveryListener.from_dict(listener_raw)
    assert listener.topic == "/my/topic"
    assert len(listener.field_getters) == 2


@pytest.fixture
def transport_payload():
    return {
        "command": "notify",
        "id": "30523-042:47",
        "payload": {
            "temperature": 21.5,
            "state": 0,
            "set_temperature": 19,
            "set_temperature_min": 16,
            "set_temperature_max": 32,
            "set_temperature_cool_min": None,
            "set_temperature_cool_max": None,
            "set_temperature_heat_min": None,
            "set_temperature_heat_max": None,
            "set_temperature_auto_min": None,
            "set_temperature_auto_max": None,
            "mode": 2,
            "fan_speed": None,
            "changes": {"temperature": 21.5},
        },
        "gateway_id": "b831c424a37e41fba308bf7119f95e47907214eeeae4bedfa08df6c2a28f448",
    }


def test_parse(listener_raw, transport_payload):
    listener = DiscoveryListener.from_dict(listener_raw)
    result = listener.parse(transport_payload)
    assert result == {
        "vendor_id": "30523-042:47",
        "gateway_id": "b831c424a37e41fba308bf7119f95e47907214eeeae4bedfa08df6c2a28f448",
    }
