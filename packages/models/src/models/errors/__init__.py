class NotFoundError(Exception):
    """Raised when a requested resource is not found."""


class ForbiddenError(Exception):
    """Raised when an action is forbidden."""


class InvalidError(ValueError):
    """Raised when an invalid input is submitted."""


class ConfirmationError(ValueError):
    """Raised when the result of a command failed to be confirmed."""
