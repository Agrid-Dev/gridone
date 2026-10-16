import dataclasses

from devices_manager.core.driver import AttributeDriver, Driver, LocalizedText
from devices_manager.core.driver.revision import get_driver_revision
from devices_manager.types import DataType


def _with_attribute(driver: Driver, attribute: AttributeDriver) -> Driver:
    return dataclasses.replace(
        driver, attributes={**driver.attributes, attribute.name: attribute}
    )


def test_revision_is_a_stable_digest(driver: Driver):
    first = get_driver_revision(driver)

    assert first == get_driver_revision(driver)
    assert len(first) == 64
    assert int(first, 16) >= 0


def test_revision_moves_when_an_attribute_label_changes(driver: Driver):
    labelled = driver.attributes["temperature"].model_copy(
        update={"label": LocalizedText(default="Temperature")}
    )

    assert get_driver_revision(_with_attribute(driver, labelled)) != (
        get_driver_revision(driver)
    )


def test_revision_moves_when_an_attribute_is_added(driver: Driver):
    extra = AttributeDriver(
        name="extra", data_type=DataType.FLOAT, read="GET /extra", codecs=[]
    )

    assert get_driver_revision(_with_attribute(driver, extra)) != (
        get_driver_revision(driver)
    )


def test_revision_ignores_driver_metadata(driver: Driver):
    renamed = dataclasses.replace(
        driver, metadata=driver.metadata.model_copy(update={"vendor": "Acme"})
    )

    assert get_driver_revision(renamed) == get_driver_revision(driver)
