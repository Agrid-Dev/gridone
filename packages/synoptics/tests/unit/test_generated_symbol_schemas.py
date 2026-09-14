"""The symbol schemas checked into the SDK are the registry's, regenerated
with ``python packages/synoptics/generate_symbol_schemas.py``."""

import importlib.util
import json
from pathlib import Path

from synoptics.symbols import build_default_registry

SCRIPT = Path(__file__).parents[2] / "generate_symbol_schemas.py"


def _output_path() -> Path:
    """The script is not a package module, so load it by path for its OUTPUT."""
    spec = importlib.util.spec_from_file_location("generate_symbol_schemas", SCRIPT)
    assert spec is not None
    assert spec.loader is not None
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module.OUTPUT


def test_the_committed_symbol_schemas_match_the_registry():
    committed = json.loads(_output_path().read_text())
    assert committed == build_default_registry().schemas()
