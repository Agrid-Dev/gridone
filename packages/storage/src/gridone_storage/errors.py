class StorageError(Exception):
    """Base exception for storage infrastructure errors."""


class NotFoundError(StorageError):
    """Raised when a requested entity does not exist in storage."""
