import importlib.util
from pathlib import Path

_FIXTURES = Path(__file__).parent / "fixtures"


def pytest_configure(config: object) -> None:  # noqa: ARG001
    # Must run before collection: load_scenarios() in test_aggregation.py reads
    # the cases/ directory at parametrize time, before any session fixture fires.
    cases_dir = _FIXTURES / "cases"
    if not cases_dir.exists() or not any(cases_dir.iterdir()):
        spec = importlib.util.spec_from_file_location(
            "compute", _FIXTURES / "compute.py"
        )
        mod = importlib.util.module_from_spec(spec)  # type: ignore[arg-type]
        spec.loader.exec_module(mod)  # type: ignore[union-attr]
        mod.main()
