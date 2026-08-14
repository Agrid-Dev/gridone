import uuid

import pytest
from asyncua import ua

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


def test_opcua_address_topic_is_id() -> None:
    assert STRING_ADDRESS.topic == STRING_ADDRESS.id


@pytest.mark.parametrize(
    ("node_id", "expected"),
    [
        # asyncua's Int16/Int32/String are int/str subclasses; plain values
        # work at runtime (ty: ignore[invalid-argument-type] below).
        (ua.NodeId(1042, 4, ua.NodeIdType.Numeric), NUMERIC_ADDRESS),  # ty: ignore[invalid-argument-type]
        (
            ua.NodeId("Chiller.SupplyTemp", 2, ua.NodeIdType.String),  # ty: ignore[invalid-argument-type]
            STRING_ADDRESS,
        ),
        (ua.NodeId("ServerStatus", 0, ua.NodeIdType.String), DEFAULT_NS_ADDRESS),  # ty: ignore[invalid-argument-type]
    ],
)
def test_opcua_address_from_node_id(node_id: ua.NodeId, expected: OpcuaAddress) -> None:
    assert OpcuaAddress.from_node_id(node_id).id == expected.id


def test_opcua_address_from_node_id_matches_id_for_default_namespace() -> None:
    """asyncua's own NodeId.to_string() omits ns=0; .id never does — this is
    the specific mismatch from_node_id must not reproduce."""
    node_id = ua.NodeId(2267, 0, ua.NodeIdType.Numeric)  # ty: ignore[invalid-argument-type]
    assert node_id.to_string() == "i=2267"
    assert OpcuaAddress.from_node_id(node_id).id == "ns=0;i=2267"


def test_opcua_address_from_node_id_bytestring_round_trips_to_base64() -> None:
    """asyncua decodes ByteString identifiers to raw bytes; must still
    round-trip to the base64 form OPAQUE_ADDRESS.id uses."""
    opaque_bytes = (
        b"3\xf4[(\x1b\x11VG\x8f\t\xe3\xdc\xc7n(D"  # decode of OPAQUE_ADDRESS's b64
    )
    node_id = ua.NodeId(opaque_bytes, 1, ua.NodeIdType.ByteString)  # ty: ignore[invalid-argument-type]
    assert OpcuaAddress.from_node_id(node_id).id == OPAQUE_ADDRESS.id


def test_opcua_address_from_node_id_guid_round_trips_lowercase() -> None:
    guid = uuid.UUID("09087e75-8e5e-499b-954f-f2a9603db28a")
    node_id = ua.NodeId(guid, 1, ua.NodeIdType.Guid)  # ty: ignore[invalid-argument-type]
    assert OpcuaAddress.from_node_id(node_id).id == GUID_ADDRESS.id
