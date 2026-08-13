import pytest

from devices_manager.core.transports.opcua_transport.opcua_address import (
    OpcuaAddress,
)

STRING_ADDRESS = OpcuaAddress(
    namespace_index=2, identifier_type="s", identifier="Chiller.SupplyTemp"
)
NUMERIC_ADDRESS = OpcuaAddress(namespace_index=4, identifier_type="i", identifier=1042)
GUID_ADDRESS = OpcuaAddress(
    namespace_index=1,
    identifier_type="g",
    identifier="09087e75-8e5e-499b-954f-f2a9603db28a",
)
OPAQUE_ADDRESS = OpcuaAddress(
    namespace_index=1, identifier_type="b", identifier="M/RbKBsRVkePCePcx24oRA=="
)
DEFAULT_NS_ADDRESS = OpcuaAddress(
    namespace_index=0, identifier_type="s", identifier="ServerStatus"
)


@pytest.mark.parametrize(
    ("raw", "expected"),
    [
        ("ns=2;s=Chiller.SupplyTemp", STRING_ADDRESS),
        ("ns=4;i=1042", NUMERIC_ADDRESS),
        ("ns=1;g=09087e75-8e5e-499b-954f-f2a9603db28a", GUID_ADDRESS),
        ("ns=1;b=M/RbKBsRVkePCePcx24oRA==", OPAQUE_ADDRESS),
        ("s=ServerStatus", DEFAULT_NS_ADDRESS),
        ("ns = 2 ; s = Chiller.SupplyTemp", STRING_ADDRESS),
    ],
)
def test_opcua_address_from_str(raw: str, expected: OpcuaAddress) -> None:
    assert OpcuaAddress.from_str(raw) == expected


@pytest.mark.parametrize(
    ("raw", "match"),
    [
        ("not-an-address", "Invalid OPC-UA NodeId format"),
        ("ns=2;x=foo", "Invalid OPC-UA NodeId format"),
        ("ns=2;i=notanumber", "Invalid OPC-UA numeric identifier"),
        ("", "Invalid OPC-UA NodeId format"),
        ("ns=2;s=", "Invalid OPC-UA NodeId format"),
        ("ns=;s=Foo", "Invalid OPC-UA NodeId format"),
    ],
)
def test_opcua_address_from_str_invalid(raw: str, match: str) -> None:
    with pytest.raises(ValueError, match=match):
        OpcuaAddress.from_str(raw)


@pytest.mark.parametrize(
    ("address_dict", "expected"),
    [
        ({"ns": 2, "s": "Chiller.SupplyTemp"}, STRING_ADDRESS),
        ({"ns": 4, "i": 1042}, NUMERIC_ADDRESS),
        ({"ns": 1, "g": "09087e75-8e5e-499b-954f-f2a9603db28a"}, GUID_ADDRESS),
        ({"ns": 1, "b": "M/RbKBsRVkePCePcx24oRA=="}, OPAQUE_ADDRESS),
        ({"s": "ServerStatus"}, DEFAULT_NS_ADDRESS),
    ],
)
def test_opcua_address_from_dict(address_dict: dict, expected: OpcuaAddress) -> None:
    assert OpcuaAddress.from_dict(address_dict) == expected


@pytest.mark.parametrize(
    "address_dict",
    [
        {"ns": 2},
        {"ns": 2, "x": "foo"},
        {"ns": 2, "i": 1042, "s": "Chiller.SupplyTemp"},
    ],
)
def test_opcua_address_from_dict_invalid_identifier_keys(address_dict: dict) -> None:
    with pytest.raises(ValueError, match="Invalid OPC-UA NodeId dict"):
        OpcuaAddress.from_dict(address_dict)


def test_opcua_address_from_raw_str() -> None:
    assert OpcuaAddress.from_raw("ns=2;s=Chiller.SupplyTemp") == STRING_ADDRESS


def test_opcua_address_from_raw_dict() -> None:
    assert OpcuaAddress.from_raw({"ns": 2, "s": "Chiller.SupplyTemp"}) == STRING_ADDRESS


def test_opcua_address_from_raw_invalid_type() -> None:
    with pytest.raises(ValueError, match="Invalid raw address type"):
        OpcuaAddress.from_raw(42)  # type: ignore[arg-type]


def test_opcua_address_id_canonical() -> None:
    address = STRING_ADDRESS.model_copy()
    assert address.id == "ns=2;s=Chiller.SupplyTemp"


def test_opcua_address_id_equal_for_equal_properties() -> None:
    other = OpcuaAddress(
        namespace_index=2, identifier_type="s", identifier="Chiller.SupplyTemp"
    )
    assert STRING_ADDRESS.id == other.id


def test_opcua_address_id_same_across_construction_paths() -> None:
    from_str = OpcuaAddress.from_str("ns=2;s=Chiller.SupplyTemp")
    from_dict = OpcuaAddress.from_dict({"ns": 2, "s": "Chiller.SupplyTemp"})
    assert from_str.id == from_dict.id
    assert from_str == from_dict


def test_opcua_address_numeric_identifier_normalized_from_dict() -> None:
    address = OpcuaAddress.from_dict({"ns": 4, "i": "1042"})
    assert address.identifier == 1042
    assert address == NUMERIC_ADDRESS
