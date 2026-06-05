from datetime import UTC, datetime
from typing import Any

import pytest
from pydantic import ValidationError

from devices_manager.core.device.attribute import (
    Attribute,
    AttributeKind,
    FaultAttribute,
)
from devices_manager.core.device.event_log import AttributeEventLog, EventType
from devices_manager.types import DataType
from models.types import Severity

_NOW = datetime(2026, 1, 1, tzinfo=UTC)


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
    float_attribute.update_value(previous_value)
    assert float_attribute.current_value == previous_value
    assert (
        abs(float_attribute.last_updated.timestamp() - datetime.now(UTC).timestamp())
        <= 0.005
    )
    assert float_attribute.last_changed is None


def test_update_value_different(float_attribute) -> None:
    new_value = float_attribute.current_value + 2
    float_attribute.update_value(new_value)
    assert float_attribute.current_value == new_value
    assert (
        abs(float_attribute.last_updated.timestamp() - datetime.now(UTC).timestamp())
        <= 0.005
    )
    assert (
        abs(float_attribute.last_changed.timestamp() - datetime.now(UTC).timestamp())
        <= 0.005
    )


def test_attribute_kind_serializes_as_standard():
    attr = Attribute(
        name="a",
        data_type=DataType.BOOL,
        read_write_modes={"read"},
        current_value=False,
    )
    assert attr.kind == AttributeKind.STANDARD
    assert "kind" in Attribute.model_fields
    assert attr.model_dump()["kind"] == AttributeKind.STANDARD


def test_fault_attribute_kind_and_default_severity():
    attr = FaultAttribute(
        name="alarm",
        data_type=DataType.BOOL,
        read_write_modes={"read"},
        current_value=False,
        healthy_values=[False],
        last_updated=_NOW,
        last_changed=_NOW,
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
        last_updated=_NOW,
        last_changed=_NOW,
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
        last_updated=_NOW,
        last_changed=_NOW,
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
        last_updated=_NOW,
        last_changed=_NOW,
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
        last_updated=_NOW,
        last_changed=_NOW,
    )
    assert attr.is_faulty is False
    attr.update_value(new_value=True)
    assert attr.is_faulty is True
    attr.update_value(new_value=False)
    assert attr.is_faulty is False


def test_fault_attribute_is_faulty_serialized_in_model_dump():
    attr = FaultAttribute(
        name="alarm",
        data_type=DataType.BOOL,
        read_write_modes={"read"},
        current_value=True,
        healthy_values=[False],
        last_updated=_NOW,
        last_changed=_NOW,
    )
    dumped = attr.model_dump()
    assert dumped["is_faulty"] is True
    assert dumped["healthy_values"] == [False]


def test_fault_attribute_rejects_value_without_last_updated():
    with pytest.raises(ValidationError, match="last_updated"):
        FaultAttribute(
            name="alarm",
            data_type=DataType.BOOL,
            read_write_modes={"read"},
            current_value=True,
            healthy_values=[False],
            last_changed=_NOW,
        )


def test_fault_attribute_rejects_value_without_last_changed():
    with pytest.raises(ValidationError, match="last_changed"):
        FaultAttribute(
            name="alarm",
            data_type=DataType.BOOL,
            read_write_modes={"read"},
            current_value=True,
            healthy_values=[False],
            last_updated=_NOW,
        )


def test_fault_attribute_allows_none_current_value_without_timestamps():
    """An unknown-state fault (no value yet) is valid without timestamps."""
    attr = FaultAttribute(
        name="alarm",
        data_type=DataType.BOOL,
        read_write_modes={"read"},
        current_value=None,
        healthy_values=[False],
    )
    assert attr.last_updated is None
    assert attr.last_changed is None


def test_attribute_value_options_field() -> None:
    attr = Attribute(
        name="mode",
        data_type=DataType.STRING,
        read_write_modes={"read", "write"},
        current_value=None,
        value_options=["heat", "cool", "fan", "auto"],
    )
    assert attr.value_options == ["heat", "cool", "fan", "auto"]


def test_attribute_value_options_defaults_to_none() -> None:
    attr = Attribute.create("temperature", DataType.FLOAT, {"read"})
    assert attr.value_options is None


# ---------------------------------------------------------------------------
# Event log
# ---------------------------------------------------------------------------


class TestAttributeEventLog:
    def test_logs_not_in_model_dump(self) -> None:
        attr = Attribute.create("temperature", DataType.FLOAT, {"read"})
        dumped = attr.model_dump()
        assert "_logs" not in dumped
        assert "logs" not in dumped

    def test_get_logs_starts_empty(self) -> None:
        attr = Attribute.create("temperature", DataType.FLOAT, {"read"})
        logs = attr.logs
        assert logs.read == []
        assert logs.write == []
        assert logs.listen == []

    def test_append_ok_log(self) -> None:
        attr = Attribute.create("temperature", DataType.FLOAT, {"read"})
        entry = AttributeEventLog(
            event_type=EventType.READ,
            timestamp=datetime(2026, 1, 1, tzinfo=UTC),
            status="ok",
        )
        attr.append_log(entry)
        logs = attr.logs
        assert len(logs.read) == 1
        assert logs.read[0].status == "ok"
        assert logs.read[0].message is None

    def test_append_error_log(self) -> None:
        attr = Attribute.create("temperature", DataType.FLOAT, {"read"})
        entry = AttributeEventLog(
            event_type=EventType.READ,
            timestamp=datetime(2026, 1, 1, tzinfo=UTC),
            status="error",
            message="Connection refused",
        )
        attr.append_log(entry)
        assert attr.logs.read[0].message == "Connection refused"

    def test_logs_capped_at_10(self) -> None:
        attr = Attribute.create("temperature", DataType.FLOAT, {"read"})
        for _ in range(15):
            attr.append_log(
                AttributeEventLog(
                    event_type=EventType.READ,
                    timestamp=datetime(2026, 1, 1, tzinfo=UTC),
                    status="ok",
                )
            )
        assert len(attr.logs.read) == 10

    def test_logs_are_per_type(self) -> None:
        attr = Attribute.create("temperature", DataType.FLOAT, {"read", "write"})
        attr.append_log(
            AttributeEventLog(
                event_type=EventType.READ,
                timestamp=datetime(2026, 1, 1, tzinfo=UTC),
                status="ok",
            )
        )
        attr.append_log(
            AttributeEventLog(
                event_type=EventType.WRITE,
                timestamp=datetime(2026, 1, 1, tzinfo=UTC),
                status="ok",
            )
        )
        logs = attr.logs
        assert len(logs.read) == 1
        assert len(logs.write) == 1
        assert len(logs.listen) == 0

    def test_get_logs_returns_copy(self) -> None:
        attr = Attribute.create("temperature", DataType.FLOAT, {"read"})
        logs = attr.logs
        logs.read.append(
            AttributeEventLog(
                event_type=EventType.READ,
                timestamp=datetime(2026, 1, 1, tzinfo=UTC),
                status="ok",
            )
        )
        assert len(attr.logs.read) == 0
