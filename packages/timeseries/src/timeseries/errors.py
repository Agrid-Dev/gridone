class NotFoundError(Exception):
    """Raised when a requested resource is not found."""


class InvalidError(ValueError):
    """Raised when an invalid input is submitted."""
