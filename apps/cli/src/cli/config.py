import os

from dotenv import load_dotenv

load_dotenv()


def get_storage_url() -> str | None:
    """Return the storage URL from the environment, or ``None`` for memory.

    Reads ``STORAGE_URL`` (falling back to ``DATABASE_URL``) so the cli
    works against the same backends as the api server.
    """
    return os.environ.get("STORAGE_URL") or os.environ.get("DATABASE_URL")
