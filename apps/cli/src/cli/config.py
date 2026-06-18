import os

from dotenv import load_dotenv

load_dotenv()


def get_storage_url() -> str | None:
    """Return the storage URL from the environment, or ``None`` for memory.

    Priority:
    1. ``STORAGE_URL`` — explicit backend URL (postgres, yaml, …)
    2. ``DATABASE_URL`` — legacy alias
    3. ``DB_PATH`` — path to a yaml file-DB; translated to ``yaml:<path>``
    4. ``None`` — in-memory (no persistence)
    """
    url = os.environ.get("STORAGE_URL") or os.environ.get("DATABASE_URL")
    if url:
        return url
    db_path = os.environ.get("DB_PATH")
    return f"yaml:{db_path}" if db_path else None
