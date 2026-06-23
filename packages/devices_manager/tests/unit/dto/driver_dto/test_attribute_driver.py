from unittest.mock import MagicMock, patch

import pytest
from pydantic import ValidationError

from devices_manager.core.device.attribute import AttributeKind
from devices_manager.core.driver import AttributeDriver, FaultAttributeDriver
from devices_manager.core.transports import RawTransportAddress
from devices_manager.types import AttributeValueType, DataType
from models.types import Severity


def test_attribute_schema_from_dict() -> None:
    data = {
        "name": "temperature",
        "data_type": "float",
        "read": "GET {base_url}/?latitude={lattitude}&longitude={longitude}&current_weather=true",  # noqa: E501
        "codecs": [{"json_pointer": "/current_weather/temperature"}],
    }
    attribute_dto = AttributeDriver.model_validate(data)
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
    attribute_to = AttributeDriver.model_validate({**base_data, **addresses})
    assert attribute_to.read == expected_read
    assert attribute_to.write == expected_write


def test_standard_spec_kind_defaults_to_standard() -> None:
    spec = AttributeDriver.model_validate(
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
    spec = FaultAttributeDriver.model_validate(
        {"name": "alarm", "data_type": data_type, "read": mock_address},
    )
    assert spec.kind == AttributeKind.FAULT
    assert spec.severity == Severity.WARNING
    assert spec.healthy_values == expected


def test_fault_spec_float_has_no_default_healthy_values() -> None:
    spec = FaultAttributeDriver.model_validate(
        {"name": "t", "data_type": "float", "read": mock_address},
    )
    assert spec.healthy_values == []


def test_fault_spec_normalizes_scalar_healthy_value_to_list() -> None:
    spec = FaultAttributeDriver.model_validate(
        {
            "name": "code",
            "data_type": "int",
            "read": mock_address,
            "healthy_value": 42,
        },
    )
    assert spec.healthy_values == [42]


def test_fault_spec_preserves_explicit_healthy_values_list() -> None:
    spec = FaultAttributeDriver.model_validate(
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
        FaultAttributeDriver.model_validate(
            {
                "name": "x",
                "data_type": "int",
                "read": mock_address,
                "healthy_value": 1,
                "healthy_values": [2],
            },
        )


def test_fault_spec_accepts_custom_severity() -> None:
    spec = FaultAttributeDriver.model_validate(
        {
            "name": "alarm",
            "data_type": "bool",
            "read": mock_address,
            "severity": "alert",
        },
    )
    assert spec.severity == Severity.ALERT


def test_fault_spec_inherits_read_write_fallback() -> None:
    spec = FaultAttributeDriver.model_validate(
        {"name": "alarm", "data_type": "bool", "read_write": mock_address},
    )
    assert spec.read == mock_address
    assert spec.write == mock_address


def test_base_spec_rejects_fault_kind() -> None:
    with pytest.raises(ValidationError):
        AttributeDriver.model_validate(
            {
                "name": "x",
                "data_type": "int",
                "read": mock_address,
                "kind": "fault",
            },
        )


def test_fault_spec_rejects_standard_kind() -> None:
    with pytest.raises(ValidationError):
        FaultAttributeDriver.model_validate(
            {
                "name": "x",
                "data_type": "int",
                "read": mock_address,
                "kind": "standard",
            },
        )


def test_attribute_driver_spec_kind_default():
    spec = AttributeDriver.model_validate(
        {"name": "temp", "data_type": "float", "read": mock_address},
    )
    assert spec.kind == AttributeKind.STANDARD


def test_fault_attribute_driver_spec_kind():
    spec = FaultAttributeDriver.model_validate(
        {
            "name": "alarm",
            "data_type": "bool",
            "read": mock_address,
            "severity": "alert",
            "healthy_values": [False],
        },
    )
    assert spec.kind == AttributeKind.FAULT


def test_spec_codec_is_built_lazily_from_codecs():
    """The `read_codec`/`write_codec` cached_properties derive from `codecs` on
    first access and are excluded from model_dump.
    """
    spec = AttributeDriver.model_validate(
        {
            "name": "temp",
            "data_type": "float",
            "read": mock_address,
            "codecs": [{"json_pointer": "/value"}],
        },
    )
    codec = spec.read_codec
    assert spec.read_codec is codec  # cached
    assert "read_codec" not in spec.model_dump()
    assert "write_codec" not in spec.model_dump()


def test_value_options_delegated_from_codec() -> None:
    spec = AttributeDriver.model_validate(
        {"name": "mode", "data_type": "str", "read": mock_address}
    )
    mock_codec = MagicMock(value_options=["heat", "cool"])
    patch_target = "devices_manager.core.driver.attribute_driver.build_codec"
    with patch(patch_target, return_value=mock_codec):
        assert spec.value_options == ["heat", "cool"]


def test_value_options_none_when_codec_has_none() -> None:
    spec = AttributeDriver.model_validate(
        {"name": "temperature", "data_type": "float", "read": mock_address}
    )
    mock_codec = MagicMock(value_options=None)
    patch_target = "devices_manager.core.driver.attribute_driver.build_codec"
    with patch(patch_target, return_value=mock_codec):
        assert spec.value_options is None


def test_no_codecs_is_identity_both_directions() -> None:
    spec = AttributeDriver.model_validate(
        {"name": "x", "data_type": "float", "read_write": "addr"}
    )
    assert spec.read_codec.decode(7) == 7
    assert spec.write_codec.encode(7) == 7


def test_root_codecs_apply_to_both_directions() -> None:
    spec = AttributeDriver.model_validate(
        {
            "name": "x",
            "data_type": "float",
            "read_write": "addr",
            "codecs": [{"scale": 0.5}],
        }
    )
    assert spec.read_codec.decode(10) == 5
    assert spec.write_codec.encode(5) == 10  # encode of scale 0.5 -> x / 0.5


def test_address_level_codecs_override_per_direction() -> None:
    spec = AttributeDriver.model_validate(
        {
            "name": "x",
            "data_type": "float",
            "read": {"topic": "up", "codecs": [{"scale": 0.1}]},
            "write": {"topic": "down", "codecs": [{"scale": 2}]},
        }
    )
    assert spec.read == {"topic": "up"}
    assert spec.write == {"topic": "down"}
    assert spec.read_codec.decode(100) == 10
    assert spec.write_codec.encode(4) == 2  # encode of scale 2 -> x / 2


def test_address_codecs_fall_back_to_root_for_other_direction() -> None:
    # write codecs specified; read has none -> read falls back to root codecs
    spec = AttributeDriver.model_validate(
        {
            "name": "x",
            "data_type": "float",
            "read": "up",
            "write": {"topic": "down", "codecs": [{"scale": 4}]},
            "codecs": [{"scale": 0.5}],
        }
    )
    assert spec.read_codec.decode(10) == 5  # root chain
    assert spec.write_codec.encode(8) == 2  # write chain: encode scale 4 -> x / 4


def test_top_level_direction_codecs_accept_shorthand() -> None:
    # write_codecs given directly (not nested in the address), single-key form
    spec = AttributeDriver.model_validate(
        {
            "name": "x",
            "data_type": "float",
            "read": "up",
            "write": "down",
            "write_codecs": [{"scale": 2}],
        }
    )
    assert spec.write_codecs is not None
    assert spec.write_codecs[0].name == "scale"
    assert spec.write_codec.encode(4) == 2


def test_value_options_falls_back_to_write_codec() -> None:
    # options only on the write chain -> value_options still surfaced
    spec = AttributeDriver.model_validate(
        {
            "name": "mode",
            "data_type": "str",
            "read": "up",
            "write": {"topic": "down", "codecs": [{"options": ["heat", "cool"]}]},
        }
    )
    assert spec.read_codec.value_options is None
    assert spec.value_options == ["heat", "cool"]
