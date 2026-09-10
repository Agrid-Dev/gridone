"""The committed plate, shared by the unit and integration suites."""

import json
from pathlib import Path

import pytest

PLATE_PATH = Path(__file__).parents[3] / "docs" / "specs" / "synoptic" / "ecs-est.json"


@pytest.fixture
def ecs_est_raw() -> dict:
    """The plate as committed, straight off disk."""
    return json.loads(PLATE_PATH.read_text(encoding="utf-8"))
