import os

from dotenv import load_dotenv

load_dotenv()


def get_storage_url() -> str | None:
    """Return ``STORAGE_URL`` from the environment, or ``None`` for memory."""
    return os.environ.get("STORAGE_URL")
