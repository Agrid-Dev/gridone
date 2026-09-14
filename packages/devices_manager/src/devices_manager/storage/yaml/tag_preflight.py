"""Audit legacy YAML tag spellings without changing device files."""

from pathlib import Path

import yaml

from devices_manager.storage.tag_migration import canonical_tag_rows


def preflight_yaml_tags(directory: Path) -> None:
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
            rows.extend((path.stem, key, value) for value in values)
    canonical_tag_rows(rows)
