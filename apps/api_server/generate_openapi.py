from __future__ import annotations

import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))

from main import app

OUTPUT = Path(__file__).parents[2] / "docs" / "src" / "openapi.json"


def main() -> None:
    schema = app.openapi()
    OUTPUT.write_text(json.dumps(schema, indent=2))
    print(f"OpenAPI spec written to {OUTPUT}")  # noqa: T201


if __name__ == "__main__":
    main()
