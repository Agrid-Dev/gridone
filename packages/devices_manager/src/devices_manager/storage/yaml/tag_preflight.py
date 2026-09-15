"""Audit legacy YAML tag spellings without changing device files."""

from pathlib import Path

import yaml

from devices_manager.storage.tag_migration import canonical_tag_rows
from models.tags import normalize_tags


def preflight_yaml_tags(directory: Path) -> None:
    """Check legacy spellings while allowing records to upgrade independently.

    A successful write replaces scalar tags with canonical value lists. Those
    upgraded records must coexist with untouched legacy files on later starts;
    only scalar spellings participate in the legacy collision check.
    """
    rows = []
    for path in sorted(directory.glob("*.yaml")):
        try:
            data = yaml.safe_load(path.read_text(encoding="utf-8"))
        except yaml.YAMLError:
            # The existing per-entity load-error path reports unreadable records.
            continue
        if not isinstance(data, dict):
            continue
        tags = data.get("tags", {})
        if not isinstance(tags, dict):
            msg = f"Invalid legacy tags in {path.name}"
            raise TypeError(msg)
        for key, stored in tags.items():
            values = [stored] if isinstance(stored, str) else stored
            if (
                not isinstance(key, str)
                or not isinstance(values, list)
                or any(not isinstance(value, str) for value in values)
            ):
                msg = f"Invalid legacy tags in {path.name}"
                raise TypeError(msg)
            if isinstance(stored, str):
                rows.append((path.stem, key, stored))
            else:
                normalize_tags({key: values})
    canonical_tag_rows(rows)
