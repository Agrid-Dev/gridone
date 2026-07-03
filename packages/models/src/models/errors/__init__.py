class NotFoundError(Exception):
    """Raised when a requested resource is not found."""


class InvalidError(ValueError):
    """Raised when an invalid input is submitted."""


class ConflictError(Exception):
    """Raised when an action conflicts with the current state of a resource."""


class ConfirmationError(ValueError):
    """Raised when the result of a command failed to be confirmed."""


class BlockedUserError(Exception):
    """Raised when a blocked user attempts to authenticate."""


class StorageError(Exception):
    """Base class for storage-related failures raised by services."""


class UnsupportedStorageError(StorageError):
    """Raised when a service is given a storage URL scheme it cannot handle.

    This is a configuration error (e.g. unknown URL scheme, malformed URL) and
    should surface as a 4xx-class problem to API callers.
    """


class StorageConnectionError(StorageError):
    """Raised when a service cannot reach or initialize its storage backend.

    This is an infrastructure error (e.g. database unreachable, migration
    failed) and should surface as a 5xx-class problem to API callers.
    """


class StorageNotInitializedError(StorageError):
    """Raised when a service's storage is used before ``load()``/``start()``.

    This is a programming error (wrong lifecycle usage), kept explicit so a
    service used before loading fails fast instead of silently misbehaving.
    """
