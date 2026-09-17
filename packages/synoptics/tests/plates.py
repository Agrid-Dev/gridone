# ruff: noqa: INP001 (importable helper module next to conftest, not a package)
"""The committed plates under ``docs/specs/synoptic/``, by file stem."""

import json
from pathlib import Path

PLATES_DIR = Path(__file__).parents[3] / "docs" / "specs" / "synoptic"
PLATE_NAMES = sorted(path.stem for path in PLATES_DIR.glob("*.json"))
"""Every committed plate, so a new one is held to the format's probes the
moment it lands next to the others."""


def read(name: str) -> dict:
    """A committed plate, straight off disk."""
    return json.loads((PLATES_DIR / f"{name}.json").read_text(encoding="utf-8"))
