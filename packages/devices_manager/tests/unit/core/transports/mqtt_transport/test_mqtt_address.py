from devices_manager.core.transports.mqtt_transport.mqtt_address import (
    MqttAddress,
    MqttRequest,
)


def test_mqtt_address_creation() -> None:
    dict_data = {
        "topic": "updData/275",
        "request": {
            "topic": "275",
            "message": {"command": "READ_DATA", "data": "Temperature"},
        },
    }
    for factory in [MqttAddress.from_dict, MqttAddress.from_raw]:
        mqtt_address = factory(dict_data)
        assert mqtt_address.topic == "updData/275"
        assert mqtt_address.request.topic == "275"
        assert mqtt_address.request.message == {
            "command": "READ_DATA",
            "data": "Temperature",
        }


def test_mqtt_address_id() -> None:
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
