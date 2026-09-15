import pytest

from commands.failures import command_failure
from models.errors import ConfirmationError, InvalidError, NotFoundError


@pytest.mark.parametrize(
    ("error", "reason"),
    [
        (PermissionError("private"), "not_writable"),
        (InvalidError("private"), "invalid_value"),
        (ValueError("private"), "invalid_value"),
        (TypeError("private"), "invalid_value"),
        (ConfirmationError("private"), "unconfirmed"),
        (NotFoundError("private"), "not_found"),
        (TimeoutError("private"), "unreachable"),
        (RuntimeError("private SQL or file path"), "failed"),
    ],
)
def test_writer_errors_have_safe_stable_reasons(error, reason):
    assert command_failure(error) == reason
