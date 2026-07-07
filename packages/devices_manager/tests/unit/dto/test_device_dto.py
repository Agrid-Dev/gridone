from __future__ import annotations

import json
from datetime import UTC, datetime

import pytest
from pydantic import ValidationError

from devices_manager.core.device import (
    Attribute,
    CoreDevice,
    FaultAttribute,
)
from devices_manager.core.device.attribute import AttributeKind
from devices_manager.dto.device_dto import (
    Device,
    DeviceCreate,
    core_to_dto,
)
from devices_manager.types import DataType
from models.types import Severity


@pytest.fixture
def make_device(driver, mock_transport_client):
    """Build a CoreDevice carrying hand-picked runtime attributes."""

    def _make(
        device_id: str, name: str, attributes: dict[str, Attribute]
    ) -> CoreDevice:
        return CoreDevice(
            id=device_id,
            name=name,
            attributes=attributes,
            driver=driver,
            transport=mock_transport_client,
            config={},
        )

    return _make


class TestDeviceCreate:
    def test_parse(self):
        payload = {
            "name": "Thermostat",
            "config": {"ip": "192.168.1.10"},
            "driver_id": "thermostat-http",
            "transport_id": "t1",
        }
        dto = DeviceCreate.model_validate(payload)
        assert dto.driver_id == "thermostat-http"
        assert dto.transport_id == "t1"

    def test_missing_driver_id_rejected(self):
        with pytest.raises(ValidationError):
            DeviceCreate.model_validate(
                {
                    "name": "Thermostat",
                    "config": {},
                    "transport_id": "t1",
                }
            )

    def test_missing_transport_id_rejected(self):
        with pytest.raises(ValidationError):
            DeviceCreate.model_validate(
                {
                    "name": "Thermostat",
                    "config": {},
                    "driver_id": "d1",
                }
            )


class TestCoreDeviceToDto:
    """Validate that core_to_dto rolls `is_faulty` up onto the Device DTO."""

    _NOW = datetime(2026, 1, 1, tzinfo=UTC)

    def _fault_attr(self, *, faulty: bool) -> FaultAttribute:
        return FaultAttribute(
            name="alarm",
            data_type=DataType.STRING,
            read_write_modes={"read"},
            current_value="error" if faulty else "ok",
            healthy_values=["ok"],
            last_updated=self._NOW,
            last_changed=self._NOW,
        )

    def test_is_faulty_true_when_any_attribute_is_faulty(self, make_device):
        device = make_device("d1", "D1", {"alarm": self._fault_attr(faulty=True)})
        assert core_to_dto(device).is_faulty is True

    def test_is_faulty_false_when_all_fault_attrs_healthy(self, make_device):
        device = make_device("d2", "D2", {"alarm": self._fault_attr(faulty=False)})
        assert core_to_dto(device).is_faulty is False

    def test_is_faulty_false_when_no_fault_attribute(self, make_device):
        device = make_device(
            "d3",
            "D3",
            {
                "reading": Attribute.create(
                    "reading", DataType.FLOAT, {"read"}, value=20.0
                ),
            },
        )
        assert core_to_dto(device).is_faulty is False


class TestDeviceAttributeSerialization:
    """`Device.attributes` uses a discriminated union keyed on `kind`: standard
    attributes serialize the base `Attribute` schema (no severity / healthy_values
    leak), fault attributes serialize the `FaultAttribute` schema with `kind`
    on the wire, and JSON payloads round-trip back to the right subclass."""

    _NOW = datetime(2026, 1, 1, tzinfo=UTC)

    def _fault_payload(self) -> dict:
        return {
            "id": "d1",
            "name": "D1",
            "config": {},
            "driver_id": "drv",
            "transport_id": "tr",
            "is_faulty": True,
            "attributes": {
                "fault_code": {
                    "kind": "fault",
                    "name": "fault_code",
                    "data_type": "int",
                    "read_write_modes": ["read"],
                    "current_value": 3,
                    "healthy_values": [0],
                    "last_updated": self._NOW.isoformat(),
                    "last_changed": self._NOW.isoformat(),
                }
            },
        }

    def test_fault_attribute_fields_round_trip_through_device_json(self, make_device):
        fault = FaultAttribute(
            name="fault_code",
            data_type=DataType.INT,
            read_write_modes={"read"},
            current_value=3,
            healthy_values=[0],
            last_updated=self._NOW,
            last_changed=self._NOW,
        )
        device = make_device("d1", "D1", {"fault_code": fault})
        dto = core_to_dto(device)

        payload = json.loads(dto.model_dump_json())
        attr_payload = payload["attributes"]["fault_code"]

        assert attr_payload["kind"] == "fault"
        assert attr_payload["severity"] == "warning"
        assert attr_payload["is_faulty"] is True
        assert attr_payload["healthy_values"] == [0]
        assert attr_payload["last_changed"] == self._NOW.isoformat().replace(
            "+00:00", "Z"
        )

    def test_standard_attribute_omits_fault_only_fields(self, make_device):
        device = make_device(
            "d2",
            "D2",
            {
                "reading": Attribute.create(
                    "reading", DataType.FLOAT, {"read"}, value=20.0
                ),
            },
        )
        dto = core_to_dto(device)

        payload = json.loads(dto.model_dump_json())
        attr_payload = payload["attributes"]["reading"]

        assert attr_payload["kind"] == "standard"
        assert "severity" not in attr_payload
        assert "is_faulty" not in attr_payload
        assert "healthy_values" not in attr_payload

    def test_device_parses_fault_attribute_from_json(self):
        device = Device.model_validate(self._fault_payload())
        attr = device.attributes["fault_code"]
        assert isinstance(attr, FaultAttribute)
        assert attr.kind == AttributeKind.FAULT
        assert attr.severity == Severity.WARNING
        assert attr.is_faulty is True
        assert attr.healthy_values == [0]

    def test_device_defaults_is_faulty_when_absent(self):
        """`is_faulty` is derived, so a stored/authored device payload need
        not carry it — it defaults to False (recomputed on first sync)."""
        device = Device.model_validate(
            {
                "id": "d5",
                "name": "D5",
                "driver_id": "drv",
                "transport_id": "tr",
                "config": {"device_instance": 1},
            }
        )
        assert device.is_faulty is False

    def test_device_requires_driver_and_transport(self):
        with pytest.raises(ValidationError):
            Device.model_validate({"id": "d6", "name": "D6", "config": {}})

    def test_device_parses_standard_attribute_without_kind(self):
        payload = {
            "id": "d3",
            "name": "D3",
            "config": {},
            "driver_id": "drv",
            "transport_id": "tr",
            "is_faulty": False,
            "attributes": {
                "reading": {
                    "name": "reading",
                    "data_type": "float",
                    "read_write_modes": ["read"],
                    "current_value": 20.0,
                }
            },
        }
        device = Device.model_validate(payload)
        attr = device.attributes["reading"]
        assert isinstance(attr, Attribute)
        assert not isinstance(attr, FaultAttribute)
        assert attr.kind == AttributeKind.STANDARD

    def test_internal_attribute_serializes_with_kind(self, make_device):
        internal = Attribute(
            name="connection_status",
            kind=AttributeKind.INTERNAL,
            data_type=DataType.STRING,
            read_write_modes={"read"},
            current_value="ok",
        )
        device = make_device("d4", "D4", {"connection_status": internal})
        dto = core_to_dto(device)
        payload = json.loads(dto.model_dump_json())
        attr_payload = payload["attributes"]["connection_status"]

        assert attr_payload["kind"] == "internal"
        assert attr_payload["current_value"] == "ok"
        assert "severity" not in attr_payload
        assert "is_faulty" not in attr_payload

    def test_internal_attribute_parses_from_json(self):
        payload = {
            "id": "d5",
            "name": "D5",
            "config": {},
            "driver_id": "drv",
            "transport_id": "tr",
            "is_faulty": False,
            "attributes": {
                "connection_status": {
                    "kind": "internal",
                    "name": "connection_status",
                    "data_type": "str",
                    "read_write_modes": ["read"],
                    "current_value": "degraded",
                }
            },
        }
        device = Device.model_validate(payload)
        attr = device.attributes["connection_status"]
        assert isinstance(attr, Attribute)
        assert attr.kind == AttributeKind.INTERNAL
        assert attr.current_value == "degraded"
