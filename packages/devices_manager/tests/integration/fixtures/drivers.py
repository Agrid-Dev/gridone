import pytest
from devices_manager.core.driver import Driver
from devices_manager.dto.driver_dto import DriverDTO, dto_to_core

THERMOCKTAT_MQTT_DRIVER = {
    "id": "thermocktat_mqtt",
    "transport": "mqtt",
    "device_config": [{"name": "device_id"}],
    "discovery": {
        "topic": "thermocktat/#",
        "field_getters": [
            {
                "name": "device_id",
                "adapters": [{"json_pointer": "/device_id"}],
            }
        ],
    },
    "attributes": [
        {
            "name": "temperature",
            "data_type": "float",
            "read": {
                "topic": "thermocktat/${device_id}/snapshot",
                "request": {
                    "topic": "thermocktat/${device_id}/get/snapshot",
                    "message": {"input": "hello"},
                },
            },
            "json_pointer": "/ambient_temperature",
        },
        {
            "name": "temperature_setpoint",
            "data_type": "float",
            "read": {
                "topic": "thermocktat/${device_id}/snapshot",
                "request": {
                    "topic": "thermocktat/${device_id}/get/snapshot",
                    "message": {"input": "hello"},
                },
            },
            "write": {
                "topic": "thermocktat/${device_id}/set/temperature_setpoint",
                "request": {
                    "topic": "thermocktat/${device_id}/set/temperature_setpoint",
                    "message": {"value": "${value}"},
                },
            },
            "json_pointer": "/temperature_setpoint",
        },
        {
            "name": "state",
            "data_type": "bool",
            "read": {
                "topic": "thermocktat/${device_id}/snapshot",
                "request": {
                    "topic": "thermocktat/${device_id}/get/snapshot",
                    "message": {"input": "hello"},
                },
            },
            "write": {
                "topic": "thermocktat/${device_id}/set/enabled",
                "request": {
                    "topic": "thermocktat/${device_id}/set/enabled",
                    "message": {"value": "${value}"},
                },
            },
            "json_pointer": "/enabled",
        },
        {
            "name": "temperature_setpoint_min",
            "data_type": "float",
            "read": {
                "topic": "thermocktat/${device_id}/snapshot",
                "request": {
                    "topic": "thermocktat/${device_id}/get/snapshot",
                    "message": {"input": "hello"},
                },
            },
            "write": {
                "topic": "thermocktat/${device_id}/set/temperature_setpoint_min",
                "request": {
                    "topic": "thermocktat/${device_id}/set/temperature_setpoint_min",
                    "message": {"value": "${value}"},
                },
            },
            "json_pointer": "/temperature_setpoint_min",
        },
        {
            "name": "temperature_setpoint_max",
            "data_type": "float",
            "read": {
                "topic": "thermocktat/${device_id}/snapshot",
                "request": {
                    "topic": "thermocktat/${device_id}/get/snapshot",
                    "message": {"input": "hello"},
                },
            },
            "write": {
                "topic": "thermocktat/${device_id}/set/temperature_setpoint_max",
                "request": {
                    "topic": "thermocktat/${device_id}/set/temperature_setpoint_max",
                    "message": {"value": "${value}"},
                },
            },
            "json_pointer": "/temperature_setpoint_max",
        },
        {
            "name": "fan_speed",
            "data_type": "str",
            "read": {
                "topic": "thermocktat/${device_id}/snapshot",
                "request": {
                    "topic": "thermocktat/${device_id}/get/snapshot",
                    "message": {"input": "hello"},
                },
            },
            "write": {
                "topic": "thermocktat/${device_id}/set/fan_speed",
                "request": {
                    "topic": "thermocktat/${device_id}/set/fan_speed",
                    "message": {"value": "${value}"},
                },
            },
            "json_pointer": "/fan_speed",
        },
        {
            "name": "mode",
            "data_type": "str",
            "read": {
                "topic": "thermocktat/${device_id}/snapshot",
                "request": {
                    "topic": "thermocktat/${device_id}/get/snapshot",
                    "message": {"input": "hello"},
                },
            },
            "write": {
                "topic": "thermocktat/${device_id}/set/mode",
                "request": {
                    "topic": "thermocktat/${device_id}/set/mode",
                    "message": {"value": "${value}"},
                },
            },
            "json_pointer": "/mode",
        },
    ],
}

THERMOCKTAT_HTTP_DRIVER = {
    "id": "thermocktat_http",
    "transport": "http",
    "device_config": [{"name": "ip"}],
    "attributes": [
        {
            "name": "temperature",
            "data_type": "float",
            "read": "GET ${ip}/v1",
            "json_pointer": "/ambient_temperature",
        },
        {
            "name": "temperature_setpoint",
            "data_type": "float",
            "read": "GET ${ip}/v1",
            "json_pointer": "/temperature_setpoint",
            "write": {
                "method": "POST",
                "path": "${ip}/v1/temperature_setpoint",
                "body": {"value": "${value}"},
            },
        },
        {
            "name": "state",
            "data_type": "bool",
            "read": "GET ${ip}/v1",
            "json_pointer": "/enabled",
            "write": {
                "method": "POST",
                "path": "${ip}/v1/enabled",
                "body": {"value": "${value}"},
            },
        },
        {
            "name": "temperature_setpoint_min",
            "data_type": "float",
            "read": "GET ${ip}/v1",
            "json_pointer": "/temperature_setpoint_min",
            "write": {
                "method": "POST",
                "path": "${ip}/v1/temperature_setpoint_min",
                "body": {"value": "${value}"},
            },
        },
        {
            "name": "temperature_setpoint_max",
            "data_type": "float",
            "read": "GET ${ip}/v1",
            "json_pointer": "/temperature_setpoint_max",
            "write": {
                "method": "POST",
                "path": "${ip}/v1/temperature_setpoint_max",
                "body": {"value": "${value}"},
            },
        },
        {
            "name": "fan_speed",
            "data_type": "str",
            "read": "GET ${ip}/v1",
            "json_pointer": "/fan_speed",
            "write": {
                "method": "POST",
                "path": "${ip}/v1/fan_speed",
                "body": {"value": "${value}"},
            },
        },
        {
            "name": "mode",
            "data_type": "str",
            "read": "GET ${ip}/v1",
            "json_pointer": "/fan_speed",
            "write": {
                "method": "POST",
                "path": "${ip}/v1/mode",
                "body": {"value": "${value}"},
            },
        },
    ],
}

THERMOCKTAT_MODBUS_DRIVER = {
    "id": "thermocktat_modbus",
    "transport": "modbus-tcp",
    "device_config": [{"name": "device_id"}],
    "attributes": [
        {"name": "temperature", "data_type": "float", "read": "IR0", "scale": 0.01},
        {
            "name": "temperature_setpoint",
            "data_type": "float",
            "read_write": "HR0",
            "scale": 0.01,
        },
        {"name": "state", "data_type": "bool", "read_write": "C0"},
        {
            "name": "temperature_setpoint_min",
            "data_type": "float",
            "read_write": "HR1",
            "scale": 0.01,
        },
        {
            "name": "temperature_setpoint_max",
            "data_type": "float",
            "read_write": "HR2",
            "scale": 0.01,
        },
        {"name": "mode", "data_type": "int", "read_write": "HR3"},
        {"name": "fan_speed", "data_type": "int", "read_write": "HR4"},
    ],
}


@pytest.fixture
def thermocktat_mqtt_driver() -> Driver:
    dto = DriverDTO.model_validate(THERMOCKTAT_MQTT_DRIVER)
    return dto_to_core(dto)


@pytest.fixture
def thermocktat_http_driver() -> Driver:
    dto = DriverDTO.model_validate(THERMOCKTAT_HTTP_DRIVER)
    return dto_to_core(dto)


@pytest.fixture
def thermocktat_modbus_driver() -> Driver:
    dto = DriverDTO.model_validate(THERMOCKTAT_MODBUS_DRIVER)
    return dto_to_core(dto)
