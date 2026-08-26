from collections.abc import Sequence

from pydantic import BaseModel
from pydantic import ValidationError as PydanticValidationError


class NotFoundError(Exception):
    """Raised when a requested resource is not found."""


class InvalidError(ValueError):
    """Raised when an invalid input is submitted."""


class ValidationErrorItem(BaseModel):
    """One field-level validation error, in pydantic's `{loc, msg, type}` shape."""

    loc: tuple[str | int, ...]
    msg: str
    type: str


def validation_error_items(exc: PydanticValidationError) -> list[ValidationErrorItem]:
    """Convert a pydantic `ValidationError` into `{loc, msg, type}` items.

    `ctx`/`input`/`url` are dropped: `ctx` may hold a raw exception object
    (any `@model_validator` ValueError), which JSON encoding can't handle, and
    `input` echoes submitted values (secrets) back to the client. The
    `"Value error, "` prefix pydantic adds to model-validator messages is
    stripped so callers see the domain message directly.
    """
    return [
        ValidationErrorItem(
            loc=err["loc"],
            msg=err["msg"].removeprefix("Value error, "),
            type=err["type"],
        )
        for err in exc.errors(
            include_url=False, include_context=False, include_input=False
        )
    ]


class SchemaValidationError(InvalidError):
    """Raised when a payload fails validation against a schema or model.

    Carries structured `errors` items; `str(exc)` keeps a flattened one-line
    summary for logs and string-only consumers.
    """

    def __init__(
        self,
        errors: Sequence[ValidationErrorItem],
        *,
        summary_prefix: str = "Validation failed: ",
    ) -> None:
        self.errors = list(errors)
        summary = "; ".join(
            f"{'.'.join(str(p) for p in item.loc) or '<root>'}: {item.msg}"
            for item in self.errors
        )
        super().__init__(f"{summary_prefix}{summary}")


class ConflictError(Exception):
    """Raised when an action conflicts with the current state of a resource."""


class ConfirmationError(ValueError):
    """Raised when the result of a command failed to be confirmed."""


class BlockedUserError(Exception):
    """Raised when a blocked user attempts to authenticate."""


class UnauthorizedError(Exception):
    """Raised when a request fails credential verification."""


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
