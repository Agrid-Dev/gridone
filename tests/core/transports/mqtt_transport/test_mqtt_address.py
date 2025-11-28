from core.transports.mqtt_transport.mqtt_address import MqttAddress


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
