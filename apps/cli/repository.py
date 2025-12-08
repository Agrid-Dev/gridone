import os
from pathlib import Path

from dotenv import load_dotenv
from storage import CoreFileStorage

load_dotenv()


def get_db_path() -> Path:
    db_path = os.environ.get("DB_PATH")
    if not db_path:
        msg = "DB_PATH not found in .env file"
        raise ValueError(msg)
    return Path(db_path)


gridone_repository = CoreFileStorage(get_db_path())
