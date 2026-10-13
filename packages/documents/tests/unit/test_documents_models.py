import pytest
from pydantic import ValidationError

from documents import DocumentCreate, DocumentUpdate


@pytest.mark.parametrize(
    "body",
    [
        {},
        {"name": " "},
        {"name": None},
        {"name": "x", "unknown": True},
        {"name": "x", "allowed_role_ids": []},
    ],
)
def test_create_requires_a_valid_name_and_rejects_sharing(body):
    with pytest.raises(ValidationError):
        DocumentCreate.model_validate(body)


@pytest.mark.parametrize(
    "body",
    [
        {"name": None},
        {"name": " "},
        {"allowed_role_ids": []},
        {"asset_ids": None},
        {"device_ids": None},
    ],
)
def test_patch_rejects_null_names_and_out_of_scope_fields(body):
    with pytest.raises(ValidationError):
        DocumentUpdate.model_validate(body)


def test_name_is_trimmed_and_empty_patch_is_valid():
    assert DocumentCreate(name="  Notice  ").name == "Notice"
    assert DocumentUpdate().model_dump(exclude_unset=True) == {}
