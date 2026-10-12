import pytest
from pydantic import ValidationError

from documents import DocumentCreate, DocumentUpdate


@pytest.mark.parametrize(
    "body",
    [
        {"name": "Notice"},
        {"name": " ", "allowed_role_ids": []},
        {"name": "x", "allowed_role_ids": None},
        {"name": "x", "allowed_role_ids": [], "unknown": True},
    ],
)
def test_create_requires_valid_name_and_explicit_sharing(body):
    with pytest.raises(ValidationError):
        DocumentCreate.model_validate(body)


@pytest.mark.parametrize(
    "field", ["name", "allowed_role_ids", "asset_ids", "device_ids"]
)
def test_patch_cannot_set_null(field):
    with pytest.raises(ValidationError):
        DocumentUpdate.model_validate({field: None})


def test_admin_only_is_explicit_and_name_is_trimmed():
    assert DocumentCreate(name="  Notice  ", allowed_role_ids=[]).name == "Notice"
    assert DocumentUpdate(asset_ids=[]).model_dump(exclude_unset=True) == {
        "asset_ids": []
    }
