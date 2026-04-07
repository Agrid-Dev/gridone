import pytest

from devices_manager.core.transports.mqtt_transport.mqtt_address import (
    MqttAddress,
    MqttRequest,
)


def test_from_str_returns_listen_only_address():
    address = MqttAddress.from_str("thermocktat/abc/snapshot")
    assert address.topic == "thermocktat/abc/snapshot"
    assert address.request is None
    assert address.message is None


def test_from_raw_str_delegates_to_from_str():
    address = MqttAddress.from_raw("thermocktat/abc/snapshot")
    assert address.topic == "thermocktat/abc/snapshot"
    assert address.request is None


def test_from_dict_listen_only():
    address = MqttAddress.from_dict({"topic": "device/status"})
    assert address.topic == "device/status"
    assert address.request is None
    assert address.message is None


def test_from_dict_read_request():
    address = MqttAddress.from_dict(
        {
            "topic": "device/snapshot",
            "request": {"topic": "device/get/snapshot", "message": {"input": "hello"}},
        }
    )
    assert address.topic == "device/snapshot"
    assert isinstance(address.request, MqttRequest)
    assert address.request.topic == "device/get/snapshot"
    assert address.request.message == {"input": "hello"}
    assert address.message is None


def test_from_dict_write_address():
    address = MqttAddress.from_dict(
        {"topic": "device/set/temperature", "message": {"value": "${value}"}}
    )
    assert address.topic == "device/set/temperature"
    assert address.message == {"value": "${value}"}
    assert address.request is None


def test_from_raw_dict_delegates_to_from_dict():
    address = MqttAddress.from_raw(
        {"topic": "device/snapshot", "request": {"topic": "device/get", "message": "x"}}
    )
    assert address.topic == "device/snapshot"
    assert address.request is not None


def test_from_raw_invalid_type_raises():
    with pytest.raises(ValueError, match="Invalid raw address type"):
        MqttAddress.from_raw(123)  # type: ignore[arg-type]


def test_id_is_stable():
    a1 = MqttAddress.from_str("device/topic")
    a2 = MqttAddress.from_str("device/topic")
    assert a1.id == a2.id


def test_id_differs_for_different_topics():
    a1 = MqttAddress.from_str("device/topic/a")
    a2 = MqttAddress.from_str("device/topic/b")
    assert a1.id != a2.id
