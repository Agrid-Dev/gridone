from pathlib import Path

from storage import CoreFileStorage

DB_PATH = Path(__file__).parent / "../../.db"  # move to .env sometime :)

gridone_repository = CoreFileStorage(DB_PATH)
