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


def test_fault_attribute_kind_and_default_severity():
    attr = FaultAttribute(
        name="alarm",
        data_type=DataType.BOOL,
        read_write_modes={"read"},
        current_value=False,
        healthy_values=[False],
    )
    assert attr.kind == AttributeKind.FAULT
    assert attr.severity == Severity.WARNING


def test_fault_attribute_is_a_subclass_of_attribute():
    attr = FaultAttribute(
        name="alarm",
        data_type=DataType.BOOL,
        read_write_modes={"read"},
        current_value=False,
        healthy_values=[False],
    )
    assert isinstance(attr, Attribute)


def test_fault_attribute_accepts_custom_severity():
    attr = FaultAttribute(
        name="alarm",
        data_type=DataType.BOOL,
        read_write_modes={"read"},
        current_value=True,
        healthy_values=[False],
        severity=Severity.ALERT,
    )
    assert attr.severity == Severity.ALERT


@pytest.mark.parametrize(
    ("data_type", "healthy_values", "current_value", "expected_is_faulty"),
    [
        # bool fault: False healthy, True faulty
        (DataType.BOOL, [False], False, False),
        (DataType.BOOL, [False], True, True),
        # int fault: 0 healthy, non-zero faulty
        (DataType.INT, [0], 0, False),
        (DataType.INT, [0], 1, True),
        # str fault with multiple healthy values
        (DataType.STRING, ["OK", "IDLE"], "OK", False),
        (DataType.STRING, ["OK", "IDLE"], "IDLE", False),
        (DataType.STRING, ["OK", "IDLE"], "ALARM", True),
        # str fault default "": "" healthy, anything else faulty
        (DataType.STRING, [""], "", False),
        (DataType.STRING, [""], "ALARM", True),
    ],
)
def test_fault_attribute_is_faulty_computation(
    data_type: DataType,
    healthy_values: list,
    current_value: Any,
    expected_is_faulty: bool,
):
    attr = FaultAttribute(
        name="alarm",
        data_type=data_type,
        read_write_modes={"read"},
        current_value=current_value,
        healthy_values=healthy_values,
    )
    assert attr.is_faulty is expected_is_faulty


def test_fault_attribute_is_faulty_false_when_current_value_none():
    """Unknown != faulty per the spec."""
    attr = FaultAttribute(
        name="alarm",
        data_type=DataType.BOOL,
        read_write_modes={"read"},
        current_value=None,
        healthy_values=[False],
    )
    assert attr.is_faulty is False


def test_fault_attribute_is_faulty_reacts_to_value_update():
    """The property recomputes when current_value changes (no stale caching)."""
    attr = FaultAttribute(
        name="alarm",
        data_type=DataType.BOOL,
        read_write_modes={"read"},
        current_value=False,
        healthy_values=[False],
    )
    assert attr.is_faulty is False
    attr._update_value(new_value=True)
    assert attr.is_faulty is True
    attr._update_value(new_value=False)
    assert attr.is_faulty is False


def test_fault_attribute_is_faulty_serialized_in_model_dump():
    attr = FaultAttribute(
        name="alarm",
        data_type=DataType.BOOL,
        read_write_modes={"read"},
        current_value=True,
        healthy_values=[False],
    )
    dumped = attr.model_dump()
    assert dumped["is_faulty"] is True
    assert dumped["healthy_values"] == [False]
