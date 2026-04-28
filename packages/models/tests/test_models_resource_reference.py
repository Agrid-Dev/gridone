import pytest

from models.errors import InvalidError
from models.resource_reference import ResourceReference

_ALL_RESOURCE_TYPES = [
    "device",
    "driver",
    "transport",
    "command",
    "automation",
    "fault",
    "asset",
]


class TestResourceReferenceSerialize:
    def test_produces_correct_uri(self) -> None:
        ref = ResourceReference(resource_type="device", resource_id="abc123")
        assert ref.serialize() == "resource://device/abc123"

    def test_frozen(self) -> None:
        ref = ResourceReference(resource_type="device", resource_id="abc123")
        with pytest.raises(AttributeError):
            ref.resource_id = "other"  # type: ignore[misc]


class TestResourceReferenceParse:
    def test_roundtrip(self) -> None:
        ref = ResourceReference(resource_type="driver", resource_id="agrid-th-mqtt")
        assert ResourceReference.parse(ref.serialize()) == ref

    @pytest.mark.parametrize("resource_type", _ALL_RESOURCE_TYPES)
    def test_all_resource_types(self, resource_type: str) -> None:
        uri = f"resource://{resource_type}/some-id"
        ref = ResourceReference.parse(uri)
        assert ref.resource_type == resource_type
        assert ref.resource_id == "some-id"

    def test_invalid_scheme_raises(self) -> None:
        with pytest.raises(InvalidError):
            ResourceReference.parse("http://device/abc")

    def test_missing_id_raises(self) -> None:
        with pytest.raises(InvalidError):
            ResourceReference.parse("resource://device/")

    def test_empty_string_raises(self) -> None:
        with pytest.raises(InvalidError):
            ResourceReference.parse("")

    def test_unknown_resource_type_raises(self) -> None:
        with pytest.raises(InvalidError, match="Unknown resource type"):
            ResourceReference.parse("resource://building/abc")
