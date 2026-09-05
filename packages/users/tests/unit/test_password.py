"""Unit tests for password hashing and verification."""

import pytest

from users.password import hash_password, verify_password
from users.validation import PASSWORD_MAX_LENGTH


def test_verify_password_accepts_the_matching_password():
    assert verify_password("password12345", hash_password("password12345"))


def test_verify_password_rejects_a_wrong_password():
    assert not verify_password("wrong", hash_password("password12345"))


@pytest.mark.parametrize(
    "candidate",
    [
        pytest.param("a" * (PASSWORD_MAX_LENGTH + 1), id="ascii-over-limit"),
        # 40 characters, 80 bytes once encoded.
        pytest.param("é" * 40, id="multibyte-over-limit"),
    ],
)
def test_verify_password_rejects_an_oversized_candidate(candidate: str):
    """Without this guard the unauthenticated login route answers 500."""
    assert not verify_password(candidate, hash_password("password12345"))


def test_verify_password_accepts_a_candidate_at_the_limit():
    at_limit = "a" * PASSWORD_MAX_LENGTH
    assert verify_password(at_limit, hash_password(at_limit))
