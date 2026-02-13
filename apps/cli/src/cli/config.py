import os

from dotenv import load_dotenv

load_dotenv()


def get_database_url() -> str:
    database_url = os.environ.get("DATABASE_URL")
    if not database_url:
        msg = "DATABASE_URL is required."
        raise RuntimeError(msg)
    return database_url
