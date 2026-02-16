from pathlib import Path

import pytest
import yaml
from devices_manager.core.driver import Driver
from devices_manager.dto.driver_dto import DriverDTO, dto_to_core


@pytest.fixture
def thermocktat_mqtt_driver() -> Driver:
    fixture_path = Path(__file__).parent / "raw_drivers" / "thermockat_mqtt_driver.yaml"
    with fixture_path.open("r") as file:
        driver_data = yaml.safe_load(file)
    dto = DriverDTO.model_validate(driver_data)
    return dto_to_core(dto)


@pytest.fixture
def thermocktat_http_driver() -> Driver:
    fixture_path = Path(__file__).parent / "raw_drivers" / "thermockat_http_driver.yaml"
    with fixture_path.open("r") as file:
        driver_data = yaml.safe_load(file)
    dto = DriverDTO.model_validate(driver_data)
    return dto_to_core(dto)


@pytest.fixture
def thermocktat_modbus_driver_multi() -> Driver:
    fixture_path = (
        Path(__file__).parent / "raw_drivers" / "thermocktat_modbus_driver_multi.yaml"
    )
    with fixture_path.open("r") as file:
        driver_data = yaml.safe_load(file)
    dto = DriverDTO.model_validate(driver_data)
    return dto_to_core(dto)


@pytest.fixture
def thermocktat_modbus_driver_single() -> Driver:
    fixture_path = (
        Path(__file__).parent / "raw_drivers" / "thermocktat_modbus_driver_single.yaml"
    )
    with fixture_path.open("r") as file:
        driver_data = yaml.safe_load(file)
    dto = DriverDTO.model_validate(driver_data)
    return dto_to_core(dto)
