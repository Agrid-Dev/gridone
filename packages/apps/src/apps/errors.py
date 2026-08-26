from collections.abc import Sequence

from models.errors import SchemaValidationError, ValidationErrorItem

__all__ = [
    "AppUnreachableError",
    "ConfigValidationError",
    "InvalidAppSchemaError",
    "ValidationErrorItem",
]


class AppUnreachableError(Exception):
    """Raised when an app cannot be reached (connection error, timeout, etc.)."""


class InvalidAppSchemaError(Exception):
    """Raised when an app serves a config schema that is not a valid JSON schema.

    The app is at fault, not the caller, so this must not surface as a 422
    blaming the submitted payload.
    """


class ConfigValidationError(SchemaValidationError):
    """Raised when an app config payload fails validation against its schema.

    `loc` is relative to the config object (no `body` prefix) and mixes
    object keys with array indices, e.g. `("meters", 0, "point_id")`.
    """

    def __init__(self, errors: Sequence[ValidationErrorItem]) -> None:
        super().__init__(errors, summary_prefix="Config validation failed: ")
