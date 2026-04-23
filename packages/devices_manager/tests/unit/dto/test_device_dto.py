from __future__ import annotations

import json
from datetime import UTC, datetime

import pytest
from pydantic import TypeAdapter, ValidationError

from devices_manager.core.device import (
    Attribute,
    FaultAttribute,
    VirtualDevice,
)
from devices_manager.core.device.attribute import AttributeKind
from devices_manager.dto.device_dto import (
    AttributeCreate,
    Device,
    DeviceCreate,
    PhysicalDeviceCreate,
    VirtualDeviceCreate,
    core_to_dto,
)
from devices_manager.types import DataType, DeviceKind, ReadWriteMode
from models.types import Severity

_dto_adapter: TypeAdapter[DeviceCreate] = TypeAdapter(DeviceCreate)


class TestPhysicalDeviceCreate:
    def test_parse_explicit_physical_kind(self):
        payload = {
            "kind": "physical",
            "name": "Thermostat",
            "config": {"ip": "192.168.1.10"},
            "driver_id": "thermostat-http",
            "transport_id": "t1",
        }
        dto = _dto_adapter.validate_python(payload)
        assert isinstance(dto, PhysicalDeviceCreate)
        assert dto.kind == DeviceKind.PHYSICAL
        assert dto.driver_id == "thermostat-http"

    def test_defaults_to_physical_when_kind_omitted(self):
        """Backwards compat: payloads without 'kind' are physical."""
        payload = {
            "name": "Thermostat",
            "config": {},
            "driver_id": "d1",
            "transport_id": "t1",
        }
        dto = _dto_adapter.validate_python(payload)
        assert isinstance(dto, PhysicalDeviceCreate)
        assert dto.kind == DeviceKind.PHYSICAL

    def test_missing_driver_id_rejected(self):
        with pytest.raises(ValidationError):
            _dto_adapter.validate_python(
                {
                    "kind": "physical",
                    "name": "Thermostat",
                    "config": {},
                    "transport_id": "t1",
                }
            )

    def test_missing_transport_id_rejected(self):
        with pytest.raises(ValidationError):
            _dto_adapter.validate_python(
                {
                    "kind": "physical",
                    "name": "Thermostat",
                    "config": {},
                    "driver_id": "d1",
                }
            )


class TestVirtualDeviceCreate:
    def test_parse_virtual_kind(self):
        payload = {
            "kind": "virtual",
            "name": "Occupancy sensor",
            "attributes": [
                {"name": "occupied", "data_type": "bool", "read_write_mode": "write"}
            ],
        }
        dto = _dto_adapter.validate_python(payload)
        assert isinstance(dto, VirtualDeviceCreate)
        assert dto.kind == DeviceKind.VIRTUAL
        assert len(dto.attributes) == 1
        assert dto.attributes[0].name == "occupied"
        assert dto.attributes[0].data_type == DataType.BOOL

    def test_parse_virtual_with_type(self):
        payload = {
            "kind": "virtual",
            "name": "Smart meter",
            "type": "meter",
            "attributes": [
                {"name": "energy_kwh", "data_type": "float", "read_write_mode": "write"}
            ],
        }
        dto = _dto_adapter.validate_python(payload)
        assert isinstance(dto, VirtualDeviceCreate)
        assert dto.type == "meter"

    def test_type_defaults_to_none(self):
        dto = VirtualDeviceCreate(name="Sensor", attributes=[])
        assert dto.type is None

    def test_invalid_kind_rejected(self):
        with pytest.raises(ValidationError):
            _dto_adapter.validate_python(
                {
                    "kind": "hybrid",
                    "name": "Bad",
                    "config": {},
                    "driver_id": "d1",
                    "transport_id": "t1",
                }
            )


class TestAttributeCreate:
    @pytest.mark.parametrize(
        ("data_type", "mode"),
        [
            (DataType.BOOL, "read"),
            (DataType.FLOAT, "write"),
            (DataType.INT, "read"),
            (DataType.STRING, "write"),
        ],
    )
    def test_valid_combinations(self, data_type: DataType, mode: ReadWriteMode):
        dto = AttributeCreate(
            name="temperature", data_type=data_type, read_write_mode=mode
        )
        assert dto.name == "temperature"
        assert dto.data_type == data_type

    def test_invalid_read_write_mode_rejected(self):
        with pytest.raises(ValidationError):
            AttributeCreate(
                name="temperature",
                data_type=DataType.FLOAT,
                read_write_mode="readwrite",  # ty:ignore[invalid-argument-type]
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

    def test_is_faulty_true_when_any_attribute_is_faulty(self):
        device = VirtualDevice(
            id="d1",
            name="D1",
            attributes={"alarm": self._fault_attr(faulty=True)},
        )
        assert core_to_dto(device).is_faulty is True

    def test_is_faulty_false_when_all_fault_attrs_healthy(self):
        device = VirtualDevice(
            id="d2",
            name="D2",
            attributes={"alarm": self._fault_attr(faulty=False)},
        )
        assert core_to_dto(device).is_faulty is False

    def test_is_faulty_false_when_no_fault_attribute(self):
        device = VirtualDevice(
            id="d3",
            name="D3",
            attributes={
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
            "kind": "virtual",
            "name": "D1",
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

    def test_fault_attribute_fields_round_trip_through_device_json(self):
        fault = FaultAttribute(
            name="fault_code",
            data_type=DataType.INT,
            read_write_modes={"read"},
            current_value=3,
            healthy_values=[0],
            last_updated=self._NOW,
            last_changed=self._NOW,
        )
        device = VirtualDevice(id="d1", name="D1", attributes={"fault_code": fault})
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

    def test_standard_attribute_omits_fault_only_fields(self):
        device = VirtualDevice(
            id="d2",
            name="D2",
            attributes={
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

    def test_device_parses_standard_attribute_without_kind(self):
        payload = {
            "id": "d3",
            "kind": "virtual",
            "name": "D3",
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
