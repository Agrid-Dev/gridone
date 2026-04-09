from __future__ import annotations

from pathlib import Path
from typing import TYPE_CHECKING

import pytest
import yaml

from devices_manager.dto.driver_dto import DriverDTO, dto_to_core

if TYPE_CHECKING:
    from devices_manager.core.driver import Driver

_RAW_DRIVERS = Path(__file__).parent / "raw_drivers"


def _load_driver(filename: str) -> Driver:
    driver_data = yaml.safe_load((_RAW_DRIVERS / filename).read_text())
    return dto_to_core(DriverDTO.model_validate(driver_data))


@pytest.fixture
def thermocktat_mqtt_driver() -> Driver:
    return _load_driver("thermockat_mqtt_driver.yaml")


@pytest.fixture
def thermocktat_http_driver() -> Driver:
    return _load_driver("thermockat_http_driver.yaml")


@pytest.fixture
def thermocktat_modbus_driver_multi() -> Driver:
    return _load_driver("thermocktat_modbus_driver_multi.yaml")


@pytest.fixture
def thermocktat_modbus_driver_single() -> Driver:
    return _load_driver("thermocktat_modbus_driver_single.yaml")


@pytest.fixture
def thermocktat_knx_driver() -> Driver:
    return _load_driver("thermocktat_knx_driver.yaml")
