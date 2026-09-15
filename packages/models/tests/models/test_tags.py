import pytest
from pydantic import TypeAdapter, ValidationError

from models.tags import Tag, Tags, matches_tags
from models.targets import DevicesFilter


@pytest.mark.parametrize(
    ("text", "expected"),
    [
        ("Étage", "étage"),
        ("E\u0301TAGE", "étage"),
        ("Straße", "strasse"),
        ("ch_204.east-1", "ch_204.east-1"),
    ],
)
def test_unicode_and_case_normalization(text, expected):
    assert TypeAdapter(Tag).validate_python(text) == expected


@pytest.mark.parametrize("text", ["", " ", "a:b", "a,b", "a/b", "a b", "x" * 64])
def test_invalid_tag_tokens_are_rejected(text):
    with pytest.raises(ValidationError):
        TypeAdapter(Tag).validate_python(text)


def test_normalization_deduplicates_values_and_keeps_empty_criteria():
    assert TypeAdapter(Tags).validate_python(
        {"ÉTAGE": ["2", "2"], "étage": ["3"], "ecs": []}
    ) == {"ecs": [], "étage": ["2", "3"]}
    assert DevicesFilter(tags={"ecs": []}).tags == {"ecs": []}


@pytest.mark.parametrize(
    ("criteria", "expected"),
    [
        ({}, True),
        ({"ecs": ["east"]}, True),
        ({"ecs": ["west", "missing"]}, True),
        ({"ecs": ["east"], "floor": ["3"]}, False),
        ({"ecs": []}, False),
        ({"missing": ["east"]}, False),
    ],
)
def test_filters_intersect_keys_and_union_values(criteria, expected):
    assert matches_tags({"ecs": ["east", "west"], "floor": ["2"]}, criteria) is expected


def test_wire_tags_reject_legacy_scalar_values():
    with pytest.raises(ValidationError):
        TypeAdapter(Tags).validate_python({"ecs": "east"})
