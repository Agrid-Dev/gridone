from pathlib import Path

from api import create_app

DB_PATH = Path(__file__).parent / "../../.db"  # move to .env sometime :)

app = create_app(db_path=DB_PATH)
