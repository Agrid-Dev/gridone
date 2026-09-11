import pytest
from pydantic import ValidationError

from devices_manager.core.transports.mqtt_transport.mqtt_address import (
    MqttAddress,
    MqttFrameMatch,
    MqttRequest,
)
from devices_manager.core.transports.transport_address import PushTransportAddress


class TestMqttAddressHierarchy:
    def test_is_push_transport_address(self) -> None:
        address = MqttAddress(topic="test/topic")
        assert isinstance(address, PushTransportAddress)


class TestMqttAddressFromStr:
    def test_returns_listen_only_address(self) -> None:
        address = MqttAddress.from_str("devices/123/temperature")
        assert address.topic == "devices/123/temperature"
        assert address.request is None
        assert address.message is None

    def test_from_raw_str_delegates_to_from_str(self) -> None:
        address = MqttAddress.from_raw("devices/123/temperature")
        assert address.topic == "devices/123/temperature"
        assert address.request is None


class TestMqttAddressFromDict:
    def test_listen_only(self) -> None:
        address = MqttAddress.from_dict({"topic": "devices/123/temperature"})
        assert address.topic == "devices/123/temperature"
        assert address.request is None

    def test_with_request(self) -> None:
        data = {
            "topic": "updData/275",
            "request": {
                "topic": "275",
                "message": {"command": "READ_DATA", "data": "Temperature"},
            },
        }
        address = MqttAddress.from_dict(data)
        assert address.topic == "updData/275"
        assert address.request is not None
        assert address.request.topic == "275"
        assert address.request.message == {
            "command": "READ_DATA",
            "data": "Temperature",
        }

    def test_write_address_with_message(self) -> None:
        data = {
            "topic": "devices/123/set/temperature",
            "message": {"value": 22.5},
        }
        address = MqttAddress.from_dict(data)
        assert address.topic == "devices/123/set/temperature"
        assert address.message == {"value": 22.5}
        assert address.request is None

    def test_from_raw_dict_delegates_to_from_dict(self) -> None:
        data = {
            "topic": "updData/275",
            "request": {
                "topic": "275",
                "message": "show",
            },
        }
        address = MqttAddress.from_raw(data)
        assert address.topic == "updData/275"
        assert address.request is not None


class TestMqttAddressFromRaw:
    def test_invalid_type_raises(self) -> None:
        with pytest.raises(ValueError, match="Invalid raw address type"):
            MqttAddress.from_raw(42)  # type: ignore[arg-type]


class TestMqttAddressId:
    def test_id_is_stable(self) -> None:
        ids = set()
        for _ in range(10):
            address = MqttAddress(
                topic="XYZ",
                request=MqttRequest(topic="XYZ/show", message="Show me the value"),
            )
            ids.add(address.id)
            assert isinstance(address.id, str)
            assert len(address.id) > 1
        assert len(ids) == 1

    def test_id_differs_for_different_topics(self) -> None:
        a = MqttAddress(topic="topic/a")
        b = MqttAddress(topic="topic/b")
        assert a.id != b.id


class TestReplyMatch:
    def test_from_dict_builds_match(self) -> None:
        address = MqttAddress.from_dict(
            {
                "topic": "updData/aa",
                "request": {"topic": "aa", "message": {"data": "RT"}},
                "match": {"json_path": '$.data[?(@.name == "Temperature")]'},
            }
        )

        assert address.match == MqttFrameMatch(
            json_path='$.data[?(@.name == "Temperature")]'
        )

    def test_invalid_json_path_is_rejected(self) -> None:
        with pytest.raises(ValidationError):
            MqttAddress.from_dict({"topic": "t", "match": {"json_path": "$.data[?("}})

    def test_match_changes_address_id(self) -> None:
        plain = MqttAddress(topic="t")
        matched = MqttAddress(topic="t", match=MqttFrameMatch(json_path="$.x"))

        assert plain.id != matched.id


class TestReplyMatchAccepts:
    match = MqttFrameMatch(json_path='$.data[?(@.name == "Temperature")]')

    def test_accepts_a_frame_carrying_the_value(self) -> None:
        assert self.match.accepts('{"data": [{"name": "Temperature", "value": 21}]}')

    def test_rejects_a_frame_carrying_another_value(self) -> None:
        assert not self.match.accepts('{"data": [{"name": "Other", "value": 1}]}')

    def test_rejects_a_frame_that_is_not_json(self) -> None:
        assert not self.match.accepts("not json")

    def test_rejects_a_truncated_json_frame(self) -> None:
        assert not self.match.accepts('{"data": [{"name": "Temperature"')


# One frame exactly as an Agrid thermostat publishes it: hand-built by the
# firmware, pretty-printed, no space after the colons.
FIRMWARE_FRAME = (
    "{\n"
    '  "mac":"A0B1C2D3E4F5",\n'
    '  "ip":"10.0.0.2",\n'
    '  "ts":1788857840,\n'
    '  "data":[\n'
    "    {\n"
    '      "name":"Temperature_Raw_1",\n'
    '      "type":"DATA_TYPE_FXP1000",\n'
    '      "acl":"r0w4m0",\n'
    '      "value":26.168\n'
    "    }\n"
    "  ]\n"
    "}\n"
)


class TestFrameMatchRegex:
    def test_accepts_a_frame_carrying_the_variable(self) -> None:
        match = MqttFrameMatch(regex='"name":"Temperature_Raw_1"')

        assert match.accepts(FIRMWARE_FRAME)

    def test_closing_quote_keeps_a_name_prefix_from_matching(self) -> None:
        match = MqttFrameMatch(regex='"name":"Temperature"')

        assert not match.accepts(FIRMWARE_FRAME)

    def test_searches_the_raw_payload_without_parsing_it(self) -> None:
        assert MqttFrameMatch(regex="ALARM").accepts("ALARM raised, not json")

    def test_invalid_regex_is_rejected(self) -> None:
        with pytest.raises(ValidationError):
            MqttFrameMatch(regex="(unclosed")

    def test_from_dict_builds_a_regex_match(self) -> None:
        address = MqttAddress.from_dict(
            {"topic": "updData/aa", "match": {"regex": '"name":"Temperature"'}}
        )

        assert address.match == MqttFrameMatch(regex='"name":"Temperature"')


class TestFrameMatchShape:
    def test_requires_a_json_path_or_a_regex(self) -> None:
        with pytest.raises(ValidationError):
            MqttFrameMatch()

    def test_rejects_both_a_json_path_and_a_regex(self) -> None:
        with pytest.raises(ValidationError):
            MqttFrameMatch(json_path="$.data", regex="data")


class TestFrameMatchOnlyMatching:
    def test_forwards_only_the_frames_it_accepts(self) -> None:
        received: list[object] = []
        listener = MqttFrameMatch(regex='"name":"A"').only_matching(received.append)

        listener('{"name":"A"}')
        listener('{"name":"B"}')

        assert received == ['{"name":"A"}']
