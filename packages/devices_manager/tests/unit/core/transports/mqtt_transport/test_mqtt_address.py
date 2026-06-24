import pytest

from devices_manager.core.transports.mqtt_transport.mqtt_address import (
    MqttAddress,
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
