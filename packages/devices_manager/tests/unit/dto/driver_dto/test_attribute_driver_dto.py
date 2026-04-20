import pytest
from pydantic import ValidationError

from devices_manager.core.device.attribute import AttributeKind
from devices_manager.core.transports import RawTransportAddress
from devices_manager.dto.driver_dto.attribute_driver_dto import (
    AttributeDriverSpec,
    FaultAttributeDriverSpec,
)
from devices_manager.types import AttributeValueType, DataType
from models.types import Severity


def test_attribute_schema_from_dict() -> None:
    data = {
        "name": "temperature",
        "data_type": "float",
        "read": "GET {base_url}/?latitude={lattitude}&longitude={longitude}&current_weather=true",  # noqa: E501
        "codecs": [{"json_pointer": "/current_weather/temperature"}],
    }
    attribute_dto = AttributeDriverSpec.model_validate(data)
    assert attribute_dto.name == "temperature"
    assert attribute_dto.data_type == DataType.FLOAT
    assert attribute_dto.codecs is not None
    assert attribute_dto.codecs[0].name == "json_pointer"
    assert attribute_dto.codecs[0].argument == "/current_weather/temperature"
    assert attribute_dto.read == data["read"]
    assert attribute_dto.write is None


mock_address = (
    "GET {base_url}/?latitude={lattitude}&longitude={longitude}&current_weather=true"
)


@pytest.mark.parametrize(
    ("addresses", "expected_read", "expected_write"),
    [
        ({"read": mock_address}, mock_address, None),
        ({"read": mock_address, "write": mock_address}, mock_address, mock_address),
        ({"read_write": mock_address}, mock_address, mock_address),
        (
            {"read_write": mock_address, "write": "other_address"},
            mock_address,
            "other_address",
        ),
        (
            {"read_write": mock_address, "read": "other_address"},
            "other_address",
            mock_address,
        ),
    ],
)
def test_attribute_schema_read_write_addresses(
    addresses: dict,
    expected_read: RawTransportAddress,
    expected_write: RawTransportAddress,
) -> None:
    base_data = {  # everything in attribute_schema except read/write addresses
        "name": "temperature",
        "data_type": "float",
        "codecs": [{"json_pointer": "/current_weather/temperature"}],
    }
    attribute_to = AttributeDriverSpec.model_validate({**base_data, **addresses})
    assert attribute_to.read == expected_read
    assert attribute_to.write == expected_write


def test_standard_spec_kind_defaults_to_standard() -> None:
    spec = AttributeDriverSpec.model_validate(
        {"name": "t", "data_type": "float", "read": mock_address},
    )
    assert spec.kind == AttributeKind.STANDARD


@pytest.mark.parametrize(
    ("data_type", "expected"),
    [
        ("bool", [False]),
        ("int", [0]),
        ("str", [""]),
    ],
)
def test_fault_spec_applies_healthy_values_defaults_per_data_type(
    data_type: str,
    expected: list[AttributeValueType],
) -> None:
    spec = FaultAttributeDriverSpec.model_validate(
        {"name": "alarm", "data_type": data_type, "read": mock_address},
    )
    assert spec.kind == AttributeKind.FAULT
    assert spec.severity == Severity.WARNING
    assert spec.healthy_values == expected


def test_fault_spec_float_has_no_default_healthy_values() -> None:
    spec = FaultAttributeDriverSpec.model_validate(
        {"name": "t", "data_type": "float", "read": mock_address},
    )
    assert spec.healthy_values == []


def test_fault_spec_normalizes_scalar_healthy_value_to_list() -> None:
    spec = FaultAttributeDriverSpec.model_validate(
        {
            "name": "code",
            "data_type": "int",
            "read": mock_address,
            "healthy_value": 42,
        },
    )
    assert spec.healthy_values == [42]


def test_fault_spec_preserves_explicit_healthy_values_list() -> None:
    spec = FaultAttributeDriverSpec.model_validate(
        {
            "name": "code",
            "data_type": "int",
            "read": mock_address,
            "healthy_values": [0, 1, 2],
        },
    )
    assert spec.healthy_values == [0, 1, 2]


def test_fault_spec_rejects_both_scalar_and_list() -> None:
    with pytest.raises(ValidationError):
        FaultAttributeDriverSpec.model_validate(
            {
                "name": "x",
                "data_type": "int",
                "read": mock_address,
                "healthy_value": 1,
                "healthy_values": [2],
            },
        )


def test_fault_spec_accepts_custom_severity() -> None:
    spec = FaultAttributeDriverSpec.model_validate(
        {
            "name": "alarm",
            "data_type": "bool",
            "read": mock_address,
            "severity": "alert",
        },
    )
    assert spec.severity == Severity.ALERT


def test_fault_spec_inherits_read_write_fallback() -> None:
    spec = FaultAttributeDriverSpec.model_validate(
        {"name": "alarm", "data_type": "bool", "read_write": mock_address},
    )
    assert spec.read == mock_address
    assert spec.write == mock_address


def test_base_spec_rejects_fault_kind() -> None:
    with pytest.raises(ValidationError):
        AttributeDriverSpec.model_validate(
            {
                "name": "x",
                "data_type": "int",
                "read": mock_address,
                "kind": "fault",
            },
        )


def test_fault_spec_rejects_standard_kind() -> None:
    with pytest.raises(ValidationError):
        FaultAttributeDriverSpec.model_validate(
            {
                "name": "x",
                "data_type": "int",
                "read": mock_address,
                "kind": "standard",
            },
        )
