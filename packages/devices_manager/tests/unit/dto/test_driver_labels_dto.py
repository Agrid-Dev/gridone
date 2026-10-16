from devices_manager.core.driver import Driver
from devices_manager.core.driver.revision import get_driver_revision
from devices_manager.dto import DriverLabels
from devices_manager.dto.driver_labels_dto import driver_labels


def test_projects_what_each_attribute_declares(constrained_driver: Driver):
    labels = driver_labels(constrained_driver)

    assert labels.revision == get_driver_revision(constrained_driver)
    assert labels.attributes["temperature_setpoint"].model_dump(exclude_none=True) == {
        "label": {"default": "Setpoint", "translations": {"fr": "Consigne"}},
        "description": {"default": "Requested room temperature", "translations": {}},
        "group": "setpoints",
    }


def test_attributes_without_labels_are_absent(constrained_driver: Driver):
    labels = driver_labels(constrained_driver)

    assert set(labels.attributes) == {"temperature_setpoint"}


def test_document_carries_no_unit_nor_write_contract(constrained_driver: Driver):
    payload = driver_labels(constrained_driver).model_dump_json(exclude_none=True)

    assert "unit" not in payload
    assert "write_constraints" not in payload
    assert "GET /setpoint" not in payload


def test_a_driver_without_labels_serves_an_empty_document(driver: Driver):
    labels = driver_labels(driver)

    assert labels == DriverLabels(revision=get_driver_revision(driver), attributes={})
