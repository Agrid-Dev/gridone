from datetime import UTC, datetime
from typing import Any

import pytest

from devices_manager.core.device.attribute import (
    Attribute,
    AttributeKind,
    FaultAttribute,
)
from devices_manager.types import DataType
from models.types import Severity


@pytest.mark.parametrize(
    ("data_type", "raw_value", "expected"),
    [
        (DataType.BOOL, 1, True),
        (DataType.BOOL, 0, False),
        (DataType.INT, "1", 1),
        (DataType.FLOAT, "2.4", 2.4),
    ],
)
def test_ensure_type(data_type: DataType, raw_value: Any, expected: Any):
    attribute = Attribute(
        name="my-attribute",
        data_type=data_type,
        read_write_modes={"read"},
        current_value=raw_value,
        last_updated=None,
    )
    assert attribute.current_value == expected


@pytest.mark.parametrize(
    ("data_type", "raw_value"),
    [
        (DataType.BOOL, 8),
        (DataType.INT, True),
        (DataType.FLOAT, True),
        (DataType.FLOAT, "abc"),
    ],
)
def test_ensure_type_invalid_value(data_type: DataType, raw_value: Any):
    with pytest.raises(TypeError):
        Attribute(
            name="my-attribute",
            data_type=data_type,
            read_write_modes={"read"},
            current_value=raw_value,
            last_updated=None,
        )


@pytest.fixture
def float_attribute() -> Attribute:
    return Attribute(
        name="temperature",
        data_type=DataType.FLOAT,
        read_write_modes={"read", "write"},
        current_value=20,
        last_updated=None,
        last_changed=None,
    )


def test_update_value_same(float_attribute) -> None:
    previous_value = float_attribute.current_value
    float_attribute._update_value(previous_value)
    assert float_attribute.current_value == previous_value
    assert (
        abs(float_attribute.last_updated.timestamp() - datetime.now(UTC).timestamp())
        <= 0.005
    )
    assert float_attribute.last_changed is None


def test_update_value_different(float_attribute) -> None:
    new_value = float_attribute.current_value + 2
    float_attribute._update_value(new_value)
    assert float_attribute.current_value == new_value
    assert (
        abs(float_attribute.last_updated.timestamp() - datetime.now(UTC).timestamp())
        <= 0.005
    )
    assert (
        abs(float_attribute.last_changed.timestamp() - datetime.now(UTC).timestamp())
        <= 0.005
    )


def test_attribute_kind_classvar_is_standard():
    attr = Attribute(
        name="a",
        data_type=DataType.BOOL,
        read_write_modes={"read"},
        current_value=False,
    )
    assert attr.kind == AttributeKind.STANDARD
    assert "kind" not in Attribute.model_fields
    assert "kind" not in attr.model_dump()


def test_fault_attribute_kind_and_defaults():
    attr = FaultAttribute(
        name="alarm",
        data_type=DataType.BOOL,
        read_write_modes={"read"},
        current_value=False,
    )
    assert attr.kind == AttributeKind.FAULT
    assert attr.severity == Severity.WARNING
    assert attr.is_faulty is False


def test_fault_attribute_is_a_subclass_of_attribute():
    attr = FaultAttribute(
        name="alarm",
        data_type=DataType.BOOL,
        read_write_modes={"read"},
        current_value=False,
    )
    assert isinstance(attr, Attribute)


def test_fault_attribute_accepts_custom_severity_and_flag():
    attr = FaultAttribute(
        name="alarm",
        data_type=DataType.BOOL,
        read_write_modes={"read"},
        current_value=True,
        severity=Severity.ALERT,
        is_faulty=True,
    )
    assert attr.severity == Severity.ALERT
    assert attr.is_faulty is True
