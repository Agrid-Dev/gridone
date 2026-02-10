import os
from pathlib import Path

from devices_manager.storage import CoreFileStorage
from dotenv import load_dotenv

load_dotenv()


def get_db_path() -> Path:
    db_path = os.environ.get("DB_PATH", ".db")
    print("db_path", db_path)
    return Path(db_path)


gridone_repository = CoreFileStorage(get_db_path())
