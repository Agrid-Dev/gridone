"""Deployment-owned, multi-valued device tags and their query semantics."""

import unicodedata
from collections.abc import Collection, Mapping
from typing import Annotated

from pydantic import AfterValidator, Field

MAX_TAG_LENGTH = 63


def normalize_tag(value: str) -> str:
    """Canonicalize a tag token, preserving accents but rejecting separators.

    For example, ``Étage`` and ``E\u0301TAGE`` both become ``étage``. A colon
    separates a key from a value in query strings and cannot occur in either.
    """
    result = unicodedata.normalize("NFC", value.casefold())
    if not 1 <= len(result) <= MAX_TAG_LENGTH or any(
        not (character.isalnum() or character in "_.-") for character in result
    ):
        msg = "Tags require 1-63 letters, digits, underscores, dots or hyphens"
        raise ValueError(msg)
    return result


Tag = Annotated[
    str, AfterValidator(normalize_tag), Field(min_length=1, max_length=MAX_TAG_LENGTH)
]


def normalize_tags(tags: dict[str, list[str]]) -> dict[str, list[str]]:
    """Merge equivalent keys and deduplicate values without dropping empty filters."""
    result: dict[str, set[str]] = {}
    for key, values in tags.items():
        result.setdefault(normalize_tag(key), set()).update(
            normalize_tag(value) for value in values
        )
    return {key: sorted(values) for key, values in sorted(result.items())}


Tags = Annotated[dict[str, list[str]], AfterValidator(normalize_tags)]


def matches_tags(
    tags: Mapping[str, Collection[str]], criteria: Mapping[str, Collection[str]]
) -> bool:
    """Intersect keys and union values within each key; empty values match nothing."""
    return all(
        set(tags.get(key, ())).intersection(values) for key, values in criteria.items()
    )
