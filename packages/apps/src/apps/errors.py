from collections.abc import Sequence

from pydantic import BaseModel

from models.errors import InvalidError


class AppUnreachableError(Exception):
    """Raised when an app cannot be reached (connection error, timeout, etc.)."""


class InvalidAppSchemaError(Exception):
    """Raised when an app serves a config schema that is not a valid JSON schema.

    The app is at fault, not the caller, so this must not surface as a 422
    blaming the submitted payload.
    """


class ValidationErrorItem(BaseModel):
    """One field-level validation error, in pydantic's `{loc, msg, type}` shape.

    Mirrors the items FastAPI emits for pydantic request validation so API
    clients handle a single format. `loc` is relative to the config object
    (no `body` prefix) and mixes object keys with array indices, e.g.
    `("meters", 0, "point_id")`.
    """

    loc: tuple[str | int, ...]
    msg: str
    type: str


class ConfigValidationError(InvalidError):
    """Raised when an app config payload fails validation against its schema.

    Carries the structured `errors` items; `str(exc)` keeps the flattened
    one-line summary for logs and string-only consumers.
    """

    def __init__(self, errors: Sequence[ValidationErrorItem]) -> None:
        self.errors = list(errors)
        summary = "; ".join(
            f"{'.'.join(str(p) for p in item.loc) or '<root>'}: {item.msg}"
            for item in self.errors
        )
        super().__init__(f"Config validation failed: {summary}")
