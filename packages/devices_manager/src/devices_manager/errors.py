class NotFoundError(Exception):
    """Raised when a requested resource is not found."""


class ForbiddenError(Exception):
    """Raised when an action is forbidden."""
