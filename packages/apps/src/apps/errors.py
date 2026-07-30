class AppUnreachableError(Exception):
    """Raised when an app cannot be reached (connection error, timeout, etc.)."""


class InvalidAppSchemaError(Exception):
    """Raised when an app serves a config schema that is not a valid JSON schema.

    The app is at fault, not the caller, so this must not surface as a 422
    blaming the submitted payload.
    """
