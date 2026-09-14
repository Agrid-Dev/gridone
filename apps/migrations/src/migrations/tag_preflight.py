"""Audit a pre-upgrade API export without accessing or changing live storage."""

from collections.abc import Iterator
from typing import Any

from pydantic import BaseModel, Field, ValidationError

from devices_manager.storage.tag_migration import canonical_tag_rows
from models.tags import normalize_tag
from models.targets import DevicesFilter


def _filters(value: object, path: str = "") -> Iterator[tuple[str, dict[str, Any]]]:
    """Find persisted criteria in exported commands, dashboard widgets and synoptics.

    An attribute target nests its filter under ``devices``; a command template
    stores it directly under ``target``. Other configuration dictionaries are
    traversed but never interpreted as device tags.
    """
    if isinstance(value, list):
        for index, item in enumerate(value):
            yield from _filters(item, f"{path}[{index}]")
    elif isinstance(value, dict):
        for key, item in value.items():
            location = f"{path}.{key}" if path else str(key)
            if (
                key in {"target", "devices"}
                and isinstance(item, dict)
                and any(
                    criterion in item
                    for criterion in (*DevicesFilter.model_fields, "group_id")
                )
            ):
                yield location, item
            elif key == "group_by":
                keys = item if isinstance(item, list) else [item]
                for token in keys:
                    if isinstance(token, str):
                        normalize_tag(token)
            else:
                yield from _filters(item, location)


class _LegacyDevice(BaseModel):
    id: str
    tags: dict[str, str | list[str]] = Field(default_factory=dict)


def audit_snapshot(snapshot: dict[str, Any]) -> list[str]:
    """Return actionable findings; empty means the snapshot is ready for migration."""
    findings = []
    rows = []
    for index, data in enumerate(snapshot.get("devices", [])):
        try:
            device = _LegacyDevice.model_validate(data)
        except ValidationError:
            findings.append(f"devices[{index}]: invalid device tags")
            continue
        for key, stored in device.tags.items():
            values = [stored] if isinstance(stored, str) else stored
            rows.extend((device.id, key, value) for value in values)
    try:
        canonical_tag_rows(rows)
    except (ValueError, TypeError, AttributeError) as exc:
        findings.append(f"Device tags: {exc}")
    try:
        for location, criteria in _filters(
            {key: value for key, value in snapshot.items() if key != "devices"}
        ):
            try:
                DevicesFilter.model_validate(criteria)
            except ValidationError:
                findings.append(f"{location}: invalid persisted device criteria")
    except ValueError:
        findings.append(
            "A persisted grouping key is invalid; rename it before upgrading"
        )
    return findings
