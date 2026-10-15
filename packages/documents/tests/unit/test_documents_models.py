from datetime import UTC, datetime

import pytest
from pydantic import ValidationError

from documents import (
    DocumentCreate,
    DocumentFilters,
    DocumentUpdate,
    Folder,
    FolderCreate,
    FolderUpdate,
)
from documents.models import hidden_folder_ids


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
        {"archived": None},
    ],
)
def test_patch_rejects_null_names_and_out_of_scope_fields(body):
    with pytest.raises(ValidationError):
        DocumentUpdate.model_validate(body)


def test_name_is_trimmed_and_empty_patch_is_valid():
    assert DocumentCreate(name="  Notice  ").name == "Notice"
    assert DocumentUpdate().model_dump(exclude_unset=True) == {}


def test_null_folder_moves_a_document_to_the_top_level():
    patch = DocumentUpdate.model_validate({"folder_id": None})
    assert patch.model_fields_set == {"folder_id"}
    assert patch.folder_id is None


@pytest.mark.parametrize(
    "body",
    [{}, {"name": " "}, {"name": "x", "parent_id": ""}, {"name": "x", "extra": 1}],
)
def test_folder_create_requires_a_name_and_a_real_parent_reference(body):
    with pytest.raises(ValidationError):
        FolderCreate.model_validate(body)


@pytest.mark.parametrize(
    "body", [{"name": None}, {"archived": None}, {"parent_id": "x"}]
)
def test_folder_patch_rejects_nulls_and_moves(body):
    with pytest.raises(ValidationError):
        FolderUpdate.model_validate(body)


def test_filters_take_one_location_and_say_when_they_span_folders():
    with pytest.raises(ValidationError):
        DocumentFilters(folder_id="plans", top_level=True)
    assert DocumentFilters(q="boiler").spans_folders
    assert DocumentFilters(asset_id="room").spans_folders
    assert not DocumentFilters(folder_id="plans").spans_folders
    assert not DocumentFilters(top_level=True).spans_folders
    assert not DocumentFilters(archived=True).spans_folders


def _folder(folder_id, parent_id=None, *, archived=False) -> Folder:
    now = datetime.now(UTC)
    return Folder(
        id=folder_id,
        name=folder_id,
        parent_id=parent_id,
        archived_at=now if archived else None,
        created_by="author",
        created_at=now,
        updated_at=now,
    )


def test_hidden_folders_are_archived_ones_and_everything_below():
    folders = [
        _folder("plans", archived=True),
        _folder("level", "plans"),
        _folder("room", "level", archived=True),
        _folder("cupboard", "room"),
        _folder("notices"),
        _folder("boilers", "notices"),
    ]
    assert hidden_folder_ids(folders) == {"plans", "level", "room", "cupboard"}
    assert hidden_folder_ids(reversed(folders)) == {
        "plans",
        "level",
        "room",
        "cupboard",
    }
    assert hidden_folder_ids([_folder("plans"), _folder("level", "plans")]) == set()
    assert hidden_folder_ids([]) == set()
