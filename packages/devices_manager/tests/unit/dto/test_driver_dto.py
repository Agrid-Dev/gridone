from devices_manager.dto.driver_dto import DriverDTO


def test_driver_dto_model_validate() -> None:
    payload = {
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
            {"name": "fan_speed", "data_type": "int", "read_write": "HR3"},
        ],
    }

    dto = DriverDTO.model_validate(payload)
    assert isinstance(dto, DriverDTO)
    assert dto.id == "thermocktat_modbus"
    assert len(dto.attributes) == 7
