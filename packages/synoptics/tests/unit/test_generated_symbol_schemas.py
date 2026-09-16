"""The symbol schemas checked into the SDK are the registry's, regenerated
with ``python packages/synoptics/generate_symbol_schemas.py``."""

import json
from pathlib import Path

from synoptics.symbols import build_default_registry

REPO = Path(__file__).parents[4]
COMMITTED = REPO / "sdk" / "ts" / "src" / "generated" / "symbol-schemas.json"


def test_the_committed_symbol_schemas_match_the_registry():
    committed = json.loads(COMMITTED.read_text())
    assert committed == build_default_registry().schemas()
