"""The record is storage's private durable projection of a driver."""

from datetime import UTC, datetime

import pytest
from unit.core.fixtures.presentations import (
    load_thermostat_presentation,
    thermostat_presentation_driver,
)

from devices_manager.core.driver import (
    AttributeRef,
    Driver,
    DriverMetadata,
    FaultAttributeDriver,
    LocalizedText,
    UpdateStrategy,
    WriteConstraints,
)
from devices_manager.core.driver.attribute_driver import AttributeDriver
from devices_manager.core.presentation import PresentationEnvelope
from devices_manager.storage.driver_record import (
    DriverRecord,
    from_record,
    to_record,
)
from devices_manager.storage.memory import MemoryDevicesStorage
from devices_manager.storage.yaml.core_file_storage import CoreFileStorage
from devices_manager.types import DataType, TransportProtocols


@pytest.fixture
def core_driver():
    return Driver(
        metadata=DriverMetadata(
            id="d1",
            vendor="acme",
            model="thermostat-v2",
            version=3,
            created_at=datetime(2026, 1, 1, tzinfo=UTC),
            updated_at=datetime(2026, 2, 1, tzinfo=UTC),
        ),
        transport=TransportProtocols.HTTP,
        env={"base_url": "http://example.com"},
        device_config_required=[],
        update_strategy=UpdateStrategy(polling_interval=30),
        attributes={
            "temperature": AttributeDriver(
                name="temperature",
                data_type=DataType.FLOAT,
                read="GET /temperature",
                codecs=[],
            ),
            "alarm": FaultAttributeDriver(  # ty: ignore[missing-argument]
                name="alarm",
                data_type=DataType.BOOL,
                read="GET /alarm",
                codecs=[],
            ),
        },
        type=None,
    )


class TestRoundTrip:
    def test_preserves_identity_config_and_timestamps(self, core_driver):
        result = from_record(to_record(core_driver))
        assert result.id == core_driver.id
        assert result.metadata.vendor == "acme"
        assert result.metadata.model == "thermostat-v2"
        assert result.metadata.version == 3
        assert result.transport == core_driver.transport
        assert result.env == core_driver.env
        assert result.update_strategy == core_driver.update_strategy
        assert result.attributes == core_driver.attributes
        assert result.metadata.created_at == core_driver.metadata.created_at
        assert result.metadata.updated_at == core_driver.metadata.updated_at

    def test_attribute_kinds_survive_round_trip(self, core_driver):
        result = from_record(to_record(core_driver))
        assert type(result.attributes["temperature"]) is AttributeDriver
        assert type(result.attributes["alarm"]) is FaultAttributeDriver


class TestLegacyPayloads:
    def test_minimal_payload_uses_defaults(self):
        record = DriverRecord.model_validate(
            {
                "id": "d1",
                "transport": "http",
                "attributes": [
                    {
                        "name": "temperature",
                        "data_type": "float",
                        "read": "GET /temperature",
                    }
                ],
            }
        )
        driver = from_record(record)
        assert driver.id == "d1"
        assert driver.env == {}
        assert driver.update_strategy == UpdateStrategy()
        assert "temperature" in driver.attributes


@pytest.fixture
def annotated_driver() -> Driver:
    """A driver whose attributes carry every optional metadata field, with one
    constant bound and one bound referencing a sibling."""
    return Driver(
        metadata=DriverMetadata(id="annotated"),
        transport=TransportProtocols.HTTP,
        env={},
        device_config_required=[],
        update_strategy=UpdateStrategy(),
        attributes={
            "temperature_setpoint": AttributeDriver(
                name="temperature_setpoint",
                data_type=DataType.FLOAT,
                read="GET /setpoint",
                write="POST /setpoint",
                codecs=[],
                label=LocalizedText(
                    default="Setpoint", translations={"fr": "Consigne"}
                ),
                description=LocalizedText(default="Requested room temperature"),
                group="setpoints",
                unit="°C",
                write_constraints=WriteConstraints(
                    step=0.5,
                    minimum=AttributeRef(attribute="temperature_setpoint_min"),
                    maximum=30,
                ),
            ),
            "temperature_setpoint_min": AttributeDriver(
                name="temperature_setpoint_min",
                data_type=DataType.FLOAT,
                read="GET /min",
                codecs=[],
                unit="°C",
            ),
            "alarm": FaultAttributeDriver(  # ty: ignore[missing-argument]
                name="alarm",
                data_type=DataType.BOOL,
                read="GET /alarm",
                codecs=[],
                label=LocalizedText(default="Alarm"),
                group="diagnostics",
            ),
        },
    )


class TestAttributeMetadataRoundTrip:
    """The five optional attribute fields survive every non-postgres backend
    (the postgres case lives in tests/integration/test_postgres_storage.py)."""

    def test_record_conversion(self, annotated_driver):
        result = from_record(to_record(annotated_driver))
        assert result.attributes == annotated_driver.attributes

    def test_record_keeps_bound_kinds_apart(self, annotated_driver):
        """A constant stays a number and a reference stays a reference after
        a JSON-mode dump, which is what the file and postgres backends store."""
        record = DriverRecord.model_validate(
            to_record(annotated_driver).model_dump(mode="json")
        )
        constraints = (
            from_record(record).attributes["temperature_setpoint"].write_constraints
        )
        assert constraints == WriteConstraints(
            step=0.5,
            minimum=AttributeRef(attribute="temperature_setpoint_min"),
            maximum=30,
        )

    @pytest.mark.asyncio
    async def test_memory_backend(self, annotated_driver):
        storage = MemoryDevicesStorage()
        await storage.drivers.write(annotated_driver.id, annotated_driver)
        loaded = await storage.drivers.read(annotated_driver.id)
        assert loaded.attributes == annotated_driver.attributes

    @pytest.mark.asyncio
    async def test_yaml_backend(self, annotated_driver, tmp_path):
        storage = CoreFileStorage(tmp_path)
        await storage.drivers.write(annotated_driver.id, annotated_driver)
        loaded = await storage.drivers.read(annotated_driver.id)
        assert loaded.attributes == annotated_driver.attributes

    def test_legacy_record_without_metadata_reads_as_none(self):
        record = DriverRecord.model_validate(
            {
                "id": "d1",
                "transport": "http",
                "attributes": [
                    {"name": "temperature", "data_type": "float", "read": "GET /t"}
                ],
            }
        )
        attribute = from_record(record).attributes["temperature"]
        assert (
            attribute.label,
            attribute.description,
            attribute.group,
            attribute.unit,
            attribute.write_constraints,
        ) == (None, None, None, None, None)


FUTURE_PRESENTATION = {
    "schema_version": 4,
    "requires": ["layout/4", "hologram/1"],
    "scene": {"nodes": [{"kind": "hologram", "depth": 2.5, "on": [True, None]}]},
}


@pytest.fixture(
    params=[load_thermostat_presentation(), FUTURE_PRESENTATION],
    ids=["thermostat_v1", "future_version"],
)
def presentation_document(request) -> dict:
    return request.param


class TestPresentationRoundTrip:
    """The envelope survives every backend byte for byte, including the
    unknown nodes of a version this server does not understand."""

    def test_record_conversion(self, presentation_document):
        driver = thermostat_presentation_driver(presentation=presentation_document)
        result = from_record(to_record(driver))
        assert result.presentation == driver.presentation
        assert result.presentation is not None
        assert result.presentation.document == presentation_document

    def test_json_mode_dump(self, presentation_document):
        """What the file and postgres backends store: a JSON-mode dump."""
        driver = thermostat_presentation_driver(presentation=presentation_document)
        dumped = to_record(driver).model_dump(mode="json")
        assert dumped["presentation"] == presentation_document
        record = DriverRecord.model_validate(dumped)
        loaded = from_record(record).presentation
        assert loaded is not None
        assert loaded.document == presentation_document

    @pytest.mark.asyncio
    async def test_memory_backend(self, presentation_document):
        driver = thermostat_presentation_driver(presentation=presentation_document)
        storage = MemoryDevicesStorage()
        await storage.drivers.write(driver.id, driver)
        loaded = await storage.drivers.read(driver.id)
        assert loaded.presentation == driver.presentation
        assert loaded.presentation is not None
        assert loaded.presentation.document == presentation_document

    @pytest.mark.asyncio
    async def test_yaml_backend(self, presentation_document, tmp_path):
        driver = thermostat_presentation_driver(presentation=presentation_document)
        storage = CoreFileStorage(tmp_path)
        await storage.drivers.write(driver.id, driver)
        loaded = await storage.drivers.read(driver.id)
        assert isinstance(loaded.presentation, PresentationEnvelope)
        assert loaded.presentation.document == presentation_document

    def test_legacy_record_without_presentation_reads_as_none(self):
        record = DriverRecord.model_validate(
            {
                "id": "d1",
                "transport": "http",
                "attributes": [
                    {"name": "temperature", "data_type": "float", "read": "GET /t"}
                ],
            }
        )
        assert from_record(record).presentation is None

    def test_driver_from_dict_reads_the_presentation(self, presentation_document):
        driver = Driver.from_dict(
            {
                "id": "d1",
                "transport": "http",
                "attributes": [
                    {"name": "temperature", "data_type": "float", "read": "GET /t"}
                ],
                "presentation": presentation_document,
            }
        )
        assert driver.presentation is not None
        assert driver.presentation.document == presentation_document
        assert (
            Driver.from_dict(
                {"id": "d2", "transport": "http", "attributes": []}
            ).presentation
            is None
        )
