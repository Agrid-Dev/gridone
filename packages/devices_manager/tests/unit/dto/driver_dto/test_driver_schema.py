import textwrap

import pytest

from devices_manager.core.device.attribute import AttributeKind
from devices_manager.core.driver.update_strategy import (
    DEFAULT_POLLING_INTERVAL,
    DEFAULT_READ_TIMEOUT,
)
from devices_manager.dto.driver_dto import DriverSpec
from devices_manager.dto.driver_dto.attribute_driver_dto import (
    AttributeDriverSpec,
    FaultAttributeDriverSpec,
)
from devices_manager.types import TransportProtocols
from models.types import Severity


@pytest.fixture
def driver_schema_raw():
    return {
        "id": "test_driver",
        "transport": "http",
        "device_config": [{"name": "lattitude"}, {"name": "longitude"}],
        "update_strategy": {"polling": "15min", "timeout": "5s"},
        "attributes": [
            {
                "name": "temperature",
                "data_type": "float",
                "read": "GET ${base_url}/?latitude=${lattitude}&longitude=${longitude}&current_weather=true",  # noqa: E501
                "codecs": [{"json_pointer": "/current_weather/temperature"}],
            },
            {
                "name": "wind_speed",
                "data_type": "float",
                "read": "GET ${base_url}/?latitude=${lattitude}&longitude=${longitude}&current_weather=true",  # noqa: E501
                "codecs": [{"json_pointer": "/current_weather/wind_speed"}],
            },
        ],
    }


def test_from_dict(driver_schema_raw: dict):
    dto = DriverSpec.model_validate(driver_schema_raw)
    assert dto.id == "test_driver"
    assert dto.transport == TransportProtocols.HTTP
    assert dto.update_strategy.polling_enabled
    assert dto.update_strategy.polling_interval == 15 * 60
    assert dto.update_strategy.read_timeout == 5
    assert len(dto.attributes) == 2


def test_from_dict_empty_update_strategy(driver_schema_raw: dict):
    del driver_schema_raw["update_strategy"]
    dto = DriverSpec.model_validate(driver_schema_raw)
    assert dto.update_strategy.polling_enabled
    assert dto.update_strategy.polling_interval == DEFAULT_POLLING_INTERVAL
    assert dto.update_strategy.read_timeout == DEFAULT_READ_TIMEOUT


def test_existing_driver_schema_parses_without_fault_keys(driver_schema_raw: dict):
    """Non-fault drivers (no kind: key anywhere) must parse identically."""
    dto = DriverSpec.model_validate(driver_schema_raw)
    assert all(type(a) is AttributeDriverSpec for a in dto.attributes)
    assert all(a.kind == AttributeKind.STANDARD for a in dto.attributes)


def test_parser_forks_p1_bool_fault():
    """P1: bool fault — defaults to healthy_values=[False]."""
    dto = DriverSpec.model_validate(
        {
            "id": "d",
            "transport": "http",
            "device_config": [],
            "attributes": [
                {
                    "name": "alarm",
                    "data_type": "bool",
                    "read": "GET /alarm",
                    "kind": "fault",
                },
            ],
        },
    )
    (attr,) = dto.attributes
    assert isinstance(attr, FaultAttributeDriverSpec)
    assert attr.kind == AttributeKind.FAULT
    assert attr.data_type.value == "bool"
    assert attr.severity == Severity.WARNING
    assert attr.healthy_values == [False]


def test_parser_forks_p2_int_fault_with_mapping_codec():
    """P2: int fault with mapping codec — explicit healthy_values list."""
    dto = DriverSpec.model_validate(
        {
            "id": "d",
            "transport": "http",
            "device_config": [],
            "attributes": [
                {
                    "name": "fault_code",
                    "data_type": "int",
                    "read": "GET /code",
                    "kind": "fault",
                    "severity": "alert",
                    "healthy_values": [0, 10],
                    "codecs": [{"mapping": {"OK": 0, "MINOR": 10, "MAJOR": 20}}],
                },
            ],
        },
    )
    (attr,) = dto.attributes
    assert isinstance(attr, FaultAttributeDriverSpec)
    assert attr.severity == Severity.ALERT
    assert attr.healthy_values == [0, 10]
    assert len(attr.codecs) == 1
    assert attr.codecs[0].name == "mapping"


def test_parser_forks_p3_bitfield_fault_via_existing_addressing():
    """P3: int where bits are flags; healthy_values=[0] means no bits set."""
    dto = DriverSpec.model_validate(
        {
            "id": "d",
            "transport": "modbus-tcp",
            "device_config": [],
            "attributes": [
                {
                    "name": "status_bits",
                    "data_type": "int",
                    "read": "HR10",
                    "kind": "fault",
                    "healthy_values": [0],
                    "codecs": [{"byte_convert": "uint16 big_endian"}],
                },
            ],
        },
    )
    (attr,) = dto.attributes
    assert isinstance(attr, FaultAttributeDriverSpec)
    assert attr.healthy_values == [0]
    assert attr.read == "HR10"


@pytest.mark.parametrize(
    ("data_type", "expected"),
    [
        ("bool", [False]),
        ("int", [0]),
        ("str", [""]),
    ],
)
def test_parser_applies_healthy_values_defaults(data_type: str, expected: list):
    dto = DriverSpec.model_validate(
        {
            "id": "d",
            "transport": "http",
            "device_config": [],
            "attributes": [
                {
                    "name": "x",
                    "data_type": data_type,
                    "read": "GET /x",
                    "kind": "fault",
                },
            ],
        },
    )
    assert dto.attributes[0].healthy_values == expected


def test_parser_normalizes_scalar_healthy_value_in_yaml():
    yaml_str = textwrap.dedent("""
        id: d
        transport: http
        device_config: []
        attributes:
          - name: error_state
            data_type: str
            read: GET /state
            kind: fault
            healthy_value: ok
    """)
    dto = DriverSpec.from_yaml(yaml_str)
    assert dto.attributes[0].healthy_values == ["ok"]


def test_parser_accepts_and_ignores_top_level_definitions_key():
    """YAML anchors live under `definitions:` by convention; pyyaml resolves the
    aliases inline, and the top-level `definitions:` key is dropped on validation.
    """
    yaml_str = textwrap.dedent("""
        id: d
        transport: http
        device_config: []
        definitions:
          _anchors:
            common_pointer: &cp
              json_pointer: /current_weather/temperature
        attributes:
          - name: temp
            data_type: float
            read: GET /w
            codecs:
              - *cp
          - name: feels_like
            data_type: float
            read: GET /w
            codecs:
              - *cp
    """)
    dto = DriverSpec.from_yaml(yaml_str)
    assert not hasattr(dto, "definitions")
    assert len(dto.attributes) == 2
    for attr in dto.attributes:
        assert attr.codecs[0].name == "json_pointer"
        assert attr.codecs[0].argument == "/current_weather/temperature"


def test_parser_mixes_standard_and_fault_attributes():
    dto = DriverSpec.model_validate(
        {
            "id": "d",
            "transport": "http",
            "device_config": [],
            "attributes": [
                {"name": "temp", "data_type": "float", "read": "GET /t"},
                {
                    "name": "alarm",
                    "data_type": "bool",
                    "read": "GET /a",
                    "kind": "fault",
                },
            ],
        },
    )
    temp, alarm = dto.attributes
    assert type(temp) is AttributeDriverSpec
    assert isinstance(alarm, FaultAttributeDriverSpec)
