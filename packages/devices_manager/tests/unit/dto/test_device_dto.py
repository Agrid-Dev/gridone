from __future__ import annotations

from datetime import UTC, datetime

import pytest
from pydantic import TypeAdapter, ValidationError

from devices_manager.core.device import (
    Attribute,
    FaultAttribute,
    VirtualDevice,
)
from devices_manager.dto.device_dto import (
    AttributeCreate,
    DeviceCreate,
    PhysicalDeviceCreate,
    VirtualDeviceCreate,
    core_to_dto,
)
from devices_manager.types import DataType, DeviceKind, ReadWriteMode

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
