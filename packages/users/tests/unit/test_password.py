"""Tests for users.password."""

from users.password import hash_password, verify_password


class TestPassword:
    def test_hash_and_verify(self):
        hashed = hash_password("mysecret")
        assert verify_password("mysecret", hashed)

    def test_wrong_password(self):
        hashed = hash_password("correct")
        assert not verify_password("wrong", hashed)

    def test_different_hashes_for_same_password(self):
        h1 = hash_password("same")
        h2 = hash_password("same")
        # bcrypt uses random salt, so hashes differ
        assert h1 != h2
        assert verify_password("same", h1)
        assert verify_password("same", h2)

    def test_hash_is_string(self):
        hashed = hash_password("test")
        assert isinstance(hashed, str)
        assert hashed.startswith("$2b$")
