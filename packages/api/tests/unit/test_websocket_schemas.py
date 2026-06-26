import json
from datetime import UTC, datetime

from api.websocket.schemas import DeviceUpdateMessage


class TestDeviceUpdateMessage:
    def test_carries_attribute_timestamps_on_the_wire(self):
        message = DeviceUpdateMessage(
            device_id="d1",
            attribute="temperature",
            value=21.5,
            last_updated=datetime(2026, 6, 26, 10, 0, tzinfo=UTC),
            last_changed=datetime(2026, 6, 26, 9, 0, tzinfo=UTC),
        )

        payload = json.loads(message.model_dump_json())

        assert payload["type"] == "device_update"
        assert payload["last_updated"] == "2026-06-26T10:00:00Z"
        assert payload["last_changed"] == "2026-06-26T09:00:00Z"

    def test_attribute_timestamps_default_to_null(self):
        message = DeviceUpdateMessage(
            device_id="d1", attribute="temperature", value=21.5
        )

        payload = json.loads(message.model_dump_json())

        assert payload["last_updated"] is None
        assert payload["last_changed"] is None
