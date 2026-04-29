import pytest

from models.errors import InvalidError
from models.resource_reference import _RESOURCE_TYPES, ResourceReference


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

    @pytest.mark.parametrize("resource_type", sorted(_RESOURCE_TYPES))
    def test_all_resource_types(self, resource_type: str) -> None:
        ref = ResourceReference.parse(f"resource://{resource_type}/some-id")
        assert ref.resource_type == resource_type
        assert ref.resource_id == "some-id"

    @pytest.mark.parametrize(
        "uri",
        [
            "http://device/abc",
            "resource://device/",
            "",
            "resource://building/abc",
            "resource://device/site-a/dev-1",
        ],
    )
    def test_invalid_input_raises(self, uri: str) -> None:
        with pytest.raises(InvalidError):
            ResourceReference.parse(uri)
