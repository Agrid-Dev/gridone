import importlib.util
from pathlib import Path

import pytest

_FIXTURES = Path(__file__).parent / "fixtures"


@pytest.fixture(scope="session", autouse=True)
def generate_fixture_cases() -> None:
    cases_dir = _FIXTURES / "cases"
    if not cases_dir.exists() or not any(cases_dir.iterdir()):
        spec = importlib.util.spec_from_file_location(
            "compute", _FIXTURES / "compute.py"
        )
        mod = importlib.util.module_from_spec(spec)  # type: ignore[arg-type]
        spec.loader.exec_module(mod)  # type: ignore[union-attr]
        mod.main()
