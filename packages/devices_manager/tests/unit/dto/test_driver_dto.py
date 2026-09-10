from datetime import UTC, datetime

import pytest
import yaml
from pydantic import ValidationError

from devices_manager.core.driver import AttributeRef, LocalizedText, WriteConstraints
from devices_manager.core.presentation import PresentationEnvelope
from devices_manager.dto.driver_dto import AttributePatch, DriverPatch, DriverSpec
from devices_manager.dto.driver_dto.driver_dto import core_to_dto, dto_to_core
from models.errors import InvalidError


@pytest.fixture
def yaml_payload():
    return """
id: thermocktat_modbus
transport: modbus-tcp

device_config:
- name: device_id

attributes:
  - name: temperature
    data_type: float
    read: IR0
    scale: 0.01

  - name: temperature_setpoint
    data_type: float
    read_write: HR0
    scale: 0.01

  - name: state
    data_type: bool
    read_write: C0

  - name: temperature_setpoint_min
    data_type: float
    read_write: HR1
    scale: 0.01

  - name: temperature_setpoint_max
    data_type: float
    read_write: HR2
    scale: 0.01

  - name: mode
    data_type: int
    read_write: HR3

  - name: fan_speed
    data_type: int
    read_write: HR3

""".strip()


def test_driver_dto_from_yaml(yaml_payload):
    dto = DriverSpec.from_yaml(yaml_payload)
    assert isinstance(dto, DriverSpec)
    assert dto.id == "thermocktat_modbus"
    assert len(dto.attributes) == 7


def test_dto_to_core_to_dto_preserves_timestamps(driver):
    created = datetime(2020, 1, 1, tzinfo=UTC)
    updated = datetime(2021, 1, 1, tzinfo=UTC)
    dto = core_to_dto(driver).model_copy(
        update={"created_at": created, "updated_at": updated}
    )
    rebuilt_driver = dto_to_core(dto)
    assert rebuilt_driver.metadata.created_at == created
    assert rebuilt_driver.metadata.updated_at == updated

    rebuilt_dto = core_to_dto(rebuilt_driver)
    assert rebuilt_dto.created_at == created
    assert rebuilt_dto.updated_at == updated


@pytest.fixture
def yaml_payload_with_metadata():
    return """
id: thermostat_with_metadata
transport: http

device_config: []

attributes:
  - name: temperature_setpoint
    data_type: float
    read_write: GET /setpoint
    label:
      default: Setpoint
      translations:
        fr: Consigne
        fr-CA: Consigne (CA)
    description:
      default: Requested room temperature
    group: setpoints
    unit: °C
    write_constraints:
      step: 0.5
      minimum: { attribute: temperature_setpoint_min }
      maximum: 30

  - name: temperature_setpoint_min
    data_type: float
    read: GET /min
""".strip()


def test_driver_dto_parses_attribute_metadata(yaml_payload_with_metadata):
    dto = DriverSpec.from_yaml(yaml_payload_with_metadata)
    setpoint, minimum = dto.attributes
    assert setpoint.label == LocalizedText(
        default="Setpoint", translations={"fr": "Consigne", "fr-CA": "Consigne (CA)"}
    )
    assert setpoint.description == LocalizedText(default="Requested room temperature")
    assert setpoint.group == "setpoints"
    assert setpoint.unit == "°C"
    assert setpoint.write_constraints == WriteConstraints(
        step=0.5, minimum=AttributeRef(attribute="temperature_setpoint_min"), maximum=30
    )
    assert minimum.label is None
    assert minimum.write_constraints is None


def test_driver_dto_metadata_round_trips_through_core(yaml_payload_with_metadata):
    dto = DriverSpec.from_yaml(yaml_payload_with_metadata)
    rebuilt = core_to_dto(dto_to_core(dto))
    assert rebuilt == dto


def test_driver_dto_yaml_rejects_empty_write_constraints():
    payload = """
id: bad
transport: http
device_config: []
attributes:
  - name: temperature_setpoint
    data_type: float
    read_write: GET /setpoint
    write_constraints: {}
""".strip()
    with pytest.raises(
        ValidationError, match="at least one of step, minimum or maximum"
    ):
        DriverSpec.from_yaml(payload)


def test_driver_dto_cross_attribute_rules_apply_at_core_conversion():
    payload = """
id: bad
transport: http
device_config: []
attributes:
  - name: mode
    data_type: str
    read_write: GET /mode
    write_constraints:
      minimum: 0
""".strip()
    dto = DriverSpec.from_yaml(payload)  # the wire shape alone is fine
    with pytest.raises(InvalidError, match=r"'mode'.*not numeric"):
        dto_to_core(dto)


class TestAttributePatchMetadata:
    def test_accepts_metadata_fields(self):
        patch = AttributePatch.model_validate(
            {
                "label": {"default": "Setpoint"},
                "description": {"default": "Requested room temperature"},
                "group": "setpoints",
                "unit": "°C",
                "write_constraints": {"step": 0.5, "minimum": {"attribute": "floor"}},
            }
        )
        assert patch.label == LocalizedText(default="Setpoint")
        assert patch.write_constraints == WriteConstraints(
            step=0.5, minimum=AttributeRef(attribute="floor")
        )
        assert patch.model_fields_set == {
            "label",
            "description",
            "group",
            "unit",
            "write_constraints",
        }

    @pytest.mark.parametrize(
        "field", ["label", "description", "group", "unit", "write_constraints"]
    )
    def test_null_clears_the_field(self, field):
        patch = AttributePatch.model_validate({field: None})
        assert patch.model_dump(exclude_unset=True) == {field: None}

    @pytest.mark.parametrize(
        "payload",
        [
            {"group": "Setpoints"},
            {"unit": ""},
            {"label": {"translations": {"fr": "Consigne"}}},
            {"write_constraints": {}},
            {"write_constraints": {"step": 0}},
        ],
    )
    def test_rejects_invalid_metadata(self, payload):
        with pytest.raises(ValidationError):
            AttributePatch.model_validate(payload)


MINIMAL_PRESENTATION = {
    "schema_version": 1,
    "requires": ["layout/1"],
    "page": {"kind": "attributes"},
}


class TestDriverSpecPresentation:
    """The presentation rides on the wire as the document itself."""

    def test_absent_means_none(self, yaml_payload):
        assert DriverSpec.from_yaml(yaml_payload).presentation is None

    def test_yaml_block_parses_into_an_envelope(self, yaml_payload):
        payload = (
            yaml_payload + "\n" + yaml.safe_dump({"presentation": MINIMAL_PRESENTATION})
        )
        dto = DriverSpec.from_yaml(payload)
        assert isinstance(dto.presentation, PresentationEnvelope)
        assert dto.presentation.document == MINIMAL_PRESENTATION

    def test_thermostat_document_round_trips_through_core(
        self, yaml_payload, thermostat_document
    ):
        payload = (
            yaml_payload
            + "\n"
            + yaml.safe_dump({"presentation": thermostat_document}, allow_unicode=True)
        )
        dto = DriverSpec.from_yaml(payload)
        result = core_to_dto(dto_to_core(dto))
        assert result.presentation == dto.presentation
        assert result.presentation is not None
        assert result.presentation.document == thermostat_document
        assert result.model_dump(mode="json")["presentation"] == thermostat_document

    def test_future_version_is_kept_verbatim(self, yaml_payload):
        future = {"schema_version": 3, "requires": ["warp/1"], "scene": [1, 2.5]}
        payload = yaml_payload + "\n" + yaml.safe_dump({"presentation": future})
        dto = DriverSpec.from_yaml(payload)
        assert dto.presentation is not None
        assert dto.presentation.document == future

    @pytest.mark.parametrize(
        "presentation",
        [
            {"requires": ["layout/1"]},
            {"schema_version": "1", "requires": []},
            {"schema_version": 1},
            "not an object",
        ],
        ids=["no_version", "string_version", "no_requires", "not_object"],
    )
    def test_invalid_envelope_rejected(self, yaml_payload, presentation):
        payload = yaml_payload + "\n" + yaml.safe_dump({"presentation": presentation})
        with pytest.raises(ValidationError):
            DriverSpec.from_yaml(payload)


class TestDriverPatchPresentation:
    """Omitted, null and object are three different requests."""

    def test_omitted_is_not_set(self):
        patch = DriverPatch.model_validate({"vendor": "acme"})
        assert "presentation" not in patch.model_fields_set

    def test_null_removes(self):
        patch = DriverPatch.model_validate({"presentation": None})
        assert "presentation" in patch.model_fields_set
        assert patch.model_dump(exclude_unset=True) == {"presentation": None}

    def test_object_replaces(self):
        patch = DriverPatch.model_validate({"presentation": MINIMAL_PRESENTATION})
        assert isinstance(patch.presentation, PresentationEnvelope)
        assert patch.model_dump(exclude_unset=True) == {
            "presentation": MINIMAL_PRESENTATION
        }

    def test_invalid_envelope_rejected(self):
        with pytest.raises(ValidationError):
            DriverPatch.model_validate({"presentation": {"schema_version": 1}})
