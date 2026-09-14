import json
from pathlib import Path

from synoptics.symbols import build_default_registry

OUTPUT = (
    Path(__file__).parents[2]
    / "sdk"
    / "ts"
    / "src"
    / "generated"
    / "symbol-schemas.json"
)


def main() -> None:
    schemas = build_default_registry().schemas()
    OUTPUT.write_text(json.dumps(schemas, indent=2) + "\n")
    print(f"Symbol schemas written to {OUTPUT}")


if __name__ == "__main__":
    main()
