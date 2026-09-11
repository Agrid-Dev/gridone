"""Stable failure reasons; raw writer exceptions remain in server logs only."""

from enum import StrEnum

from models.errors import ConfirmationError, InvalidError, NotFoundError


class CommandFailure(StrEnum):
    NOT_WRITABLE = "not_writable"
    INVALID_VALUE = "invalid_value"
    UNREACHABLE = "unreachable"
    UNCONFIRMED = "unconfirmed"
    NOT_FOUND = "not_found"
    FAILED = "failed"


def command_failure(error: Exception) -> CommandFailure:
    if isinstance(error, PermissionError):
        return CommandFailure.NOT_WRITABLE
    if isinstance(error, ConfirmationError):
        return CommandFailure.UNCONFIRMED
    if isinstance(error, InvalidError | ValueError | TypeError):
        return CommandFailure.INVALID_VALUE
    if isinstance(error, NotFoundError):
        return CommandFailure.NOT_FOUND
    if isinstance(error, OSError):
        return CommandFailure.UNREACHABLE
    return CommandFailure.FAILED
