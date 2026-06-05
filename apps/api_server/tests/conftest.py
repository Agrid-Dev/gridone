import sys
from pathlib import Path

# Make the flat api_server modules (telemetry, main, logging_config) importable
# when pytest is invoked from the repo root.
sys.path.insert(0, str(Path(__file__).parent.parent))
