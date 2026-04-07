import pytest

from devices_manager.core.driver import AttributeDriver
from devices_manager.core.value_adapters.factory import ValueAdapterSpec
from devices_manager.dto.driver_dto.attribute_driver_dto import (
    AttributeDriverDTO,
    RawTransportAddress,
    core_to_dto,
    dto_to_core,
)
from devices_manager.types import DataType


def test_attribute_schema_from_dict() -> None:
    data = {
        "name": "temperature",
        "data_type": "float",
        "read": "GET {base_url}/?latitude={lattitude}&longitude={longitude}&current_weather=true",  # noqa: E501
        "json_pointer": "/current_weather/temperature",
    }
    attribute_dto = AttributeDriverDTO.model_validate(data)
    assert attribute_dto.name == "temperature"
    assert attribute_dto.data_type == DataType.FLOAT
    assert attribute_dto.value_adapters is not None
    assert attribute_dto.value_adapters[0].adapter == "json_pointer"
    assert attribute_dto.value_adapters[0].argument == "/current_weather/temperature"
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
        "json_pointer": "/current_weather/temperature",
    }
    attribute_to = AttributeDriverDTO.model_validate({**base_data, **addresses})
    assert attribute_to.read == expected_read
    assert attribute_to.write == expected_write


def test_attribute_dto_parses_listen_field() -> None:
    data = {
        "name": "temperature",
        "data_type": "float",
        "listen": "device/${device_id}/snapshot",
        "json_pointer": "/temperature",
    }
    dto = AttributeDriverDTO.model_validate(data)
    assert dto.listen == "device/${device_id}/snapshot"
    assert dto.read_request is None
    assert dto.read is None


def test_attribute_dto_parses_listen_and_read_request() -> None:
    data = {
        "name": "temperature",
        "data_type": "float",
        "listen": "device/${device_id}/snapshot",
        "read_request": {
            "topic": "device/${device_id}/get/snapshot",
            "message": {"input": "hello"},
        },
        "json_pointer": "/temperature",
    }
    dto = AttributeDriverDTO.model_validate(data)
    assert dto.listen == "device/${device_id}/snapshot"
    assert dto.read_request == {
        "topic": "device/${device_id}/get/snapshot",
        "message": {"input": "hello"},
    }


def test_attribute_dto_listen_and_read_request_round_trip() -> None:
    """core_to_dto / dto_to_core preserves listen and read_request."""
    original = AttributeDriver(
        name="temperature",
        data_type=DataType.FLOAT,
        listen="device/snapshot",
        read_request={"topic": "device/get", "message": "x"},
        value_adapter_specs=[ValueAdapterSpec(adapter="identity", argument="")],
    )
    dto = core_to_dto(original)
    restored = dto_to_core(dto)

    assert restored.listen == original.listen
    assert restored.read_request == original.read_request
    assert restored.read == original.read
