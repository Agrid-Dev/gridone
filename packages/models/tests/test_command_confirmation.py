from models.command_confirmation import REDACTED_VALUE, redact_text


def test_redaction_handles_overlapping_secrets_and_unknown_values():
    assert (
        redact_text("old password abcd / abc", "abc", "abcd", None, "")
        == f"old password {REDACTED_VALUE} / {REDACTED_VALUE}"
    )
