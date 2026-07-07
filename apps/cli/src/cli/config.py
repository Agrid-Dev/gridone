import os

from dotenv import load_dotenv

load_dotenv()


def get_storage_url() -> str | None:
    """Return ``STORAGE_URL`` from the environment, or ``None`` for memory."""
    return os.environ.get("STORAGE_URL")


def get_transport_encryption_key() -> str | None:
    """Return ``TRANSPORT_ENCRYPTION_KEY`` from the environment, or ``None``."""
    return os.environ.get("TRANSPORT_ENCRYPTION_KEY")
